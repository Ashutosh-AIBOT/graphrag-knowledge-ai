import os
import time
import logging
import threading
import json
from concurrent.futures import ThreadPoolExecutor, as_completed

from rest_framework import status, viewsets
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.throttling import UserRateThrottle
from rest_framework.pagination import PageNumberPagination
from rest_framework_simplejwt.views import TokenObtainPairView
from django.contrib.auth import get_user_model
from .models import Document, QueryLog, EvaluationPair
from .serializers import (
    RegisterSerializer,
    UserSerializer,
    DocumentSerializer,
    QueryLogSerializer,
    EvaluationPairSerializer,
)

from django.conf import settings

from .services.rag_chain import RAGChain
from .services.nl_to_cypher import NLToCypher
from .services.multihop_reasoner import MultiHopReasoner
from .services.community_detector import CommunityDetector
from .services.neo4j_client import Neo4jClient
from .services.graph_retriever import GraphRetriever
from .services.graph_builder import GraphBuilder

# Concurrency control for background ingestion — from settings
_ingestion_semaphore = threading.Semaphore(settings.MAX_INGESTION_WORKERS)

logger = logging.getLogger(__name__)

User = get_user_model()


# ============================================================
# Custom Throttle Classes
# ============================================================

class LLMLoadThrottle(UserRateThrottle):
    """Stricter throttle for LLM-heavy endpoints."""
    rate = '20/minute'


# ============================================================
# Helper — background ingestion thread
# ============================================================

def trigger_ingestion_background(document_id, user_id):
    """
    Isolated target runner to execute ingestion processing inside a background thread.
    Uses a semaphore to limit concurrent ingestion jobs to 3.
    Handles LLM API key errors and unexpected failures gracefully.
    """
    acquired = _ingestion_semaphore.acquire(blocking=False)
    if not acquired:
        logger.warning("Ingestion concurrency limit reached. Rejecting document ID: %s", document_id)
        try:
            doc = Document.objects.get(id=document_id)
            doc.status = Document.Status.FAILED
            doc.error_message = "Too many documents processing concurrently. Please try again later."
            doc.save()
        except Exception:
            pass
        return

    logger.info("Background thread spawned for ingestion of document ID: %s", document_id)
    try:
        builder = GraphBuilder()
        builder.process_document(document_id, user_id)
        logger.info("Background ingestion completed successfully for document ID: %s", document_id)
    except ValueError as e:
        logger.error("LLM API key error for document ID: %s. Error: %s", document_id, str(e))
        try:
            doc = Document.objects.get(id=document_id)
            doc.status = Document.Status.FAILED
            doc.error_message = str(e)
            doc.save()
        except Exception:
            pass
    except Exception as e:
        logger.error("Critical error in background ingestion thread for document ID: %s. Error: %s",
                     document_id, str(e), exc_info=True)
        try:
            doc = Document.objects.get(id=document_id)
            doc.status = Document.Status.FAILED
            doc.error_message = f"Unexpected error: {str(e)}"
            doc.save()
        except Exception:
            pass
    finally:
        _ingestion_semaphore.release()


# ============================================================
# Endpoint #20: GET /api/health/
# ============================================================

class HealthCheckView(APIView):
    """
    Health check endpoint — verifies Django + Neo4j connectivity.
    Used by Docker / Kubernetes probes.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        health = {
            "django": "healthy",
            "neo4j": "unknown",
            "timestamp": time.time()
        }

        # Check Neo4j connectivity
        try:
            neo4j_client = Neo4jClient()
            neo4j_client.execute_query("RETURN 1 AS test")
            health["neo4j"] = "healthy"
        except Exception as e:
            logger.error("Neo4j health check failed: %s", str(e))
            health["neo4j"] = "unhealthy"

        overall = "healthy" if health["neo4j"] == "healthy" else "degraded"

        return Response({
            "status": overall,
            "services": health
        }, status=status.HTTP_200_OK)


# ============================================================
# Endpoint #1: POST /api/auth/register/
# ============================================================

class RegisterView(APIView):
    """
    Endpoint for new user registration.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        logger.info("Received account registration request.")
        serializer = RegisterSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            logger.info("Successfully registered user account: %s", user.username)
            return Response(
                {
                    "message": "User registered successfully.",
                    "user": UserSerializer(user).data
                },
                status=status.HTTP_201_CREATED
            )
        logger.warning("Registration request failed validation check: %s", serializer.errors)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# ============================================================
# Endpoint #2: POST /api/auth/login/
# ============================================================

class CustomTokenObtainPairView(TokenObtainPairView):
    """
    Custom JWT Token Obtain View to add custom execution logs.
    """
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        username = request.data.get('username')
        logger.info("Authentication attempt received for user: %s", username)
        try:
            response = super().post(request, *args, **kwargs)
            logger.info("Authentication successful for user: %s", username)
            return response
        except Exception as e:
            logger.warning("Authentication failed for user: %s. Error: %s", username, str(e))
            return Response(
                {"error": str(e)},
                status=status.HTTP_401_UNAUTHORIZED
            )


# ============================================================
# Endpoint #4: POST /api/documents/upload/
# ============================================================

class DocumentUploadView(APIView):
    """
    Endpoint for uploading documents. Runs the parsing and extraction pipeline
    in a non-blocking background thread.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        logger.info("Received document upload request from user: %s", request.user.username)

        if 'file' not in request.FILES:
            logger.warning("Document upload request rejected: No file attachment found.")
            return Response(
                {"error": "No file was uploaded."},
                status=status.HTTP_400_BAD_REQUEST
            )

        file_obj = request.FILES['file']

        # --- File Validation ---
        ext = os.path.splitext(file_obj.name)[1].lower()
        if ext not in settings.ALLOWED_EXTENSIONS:
            return Response(
                {"error": f"File type '{ext}' is not allowed. Supported: {', '.join(sorted(settings.ALLOWED_EXTENSIONS))}"},
                status=status.HTTP_400_BAD_REQUEST
            )

        if file_obj.size > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
            return Response(
                {"error": f"File size exceeds {settings.MAX_UPLOAD_SIZE_MB}MB limit."},
                status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
            )

        if file_obj.size == 0:
            return Response(
                {"error": "Empty files are not allowed."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Save document record with initial PENDING status
        doc = Document.objects.create(
            user=request.user,
            name=file_obj.name,
            file=file_obj,
            status=Document.Status.PENDING,
            source=request.data.get('source', '')
        )
        logger.info("Saved initial document metadata row. ID: %s | Name: %s", doc.id, doc.name)

        # Launch background pipeline thread
        thread = threading.Thread(
            target=trigger_ingestion_background,
            args=(doc.id, request.user.id)
        )
        thread.daemon = True
        thread.start()

        # Return 202 Accepted immediately so client is non-blocking
        return Response(
            {
                "message": "File upload accepted. Ingestion running in background.",
                "document": DocumentSerializer(doc, context={'request': request}).data
            },
            status=status.HTTP_202_ACCEPTED
        )


# ============================================================
# Endpoints #5, #6: /api/documents/ (list, retrieve, delete)
# ============================================================

class DocumentViewSet(viewsets.ModelViewSet):
    """
    ViewSet for listing, retrieving details, and deleting user documents.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = DocumentSerializer
    http_method_names = ['get', 'delete']
    pagination_class = PageNumberPagination
    page_size = 20

    def get_queryset(self):
        # Enforce multi-tenancy: users can only see their own documents
        return Document.objects.filter(user=self.request.user)

    def destroy(self, request, *args, **kwargs):
        doc = self.get_object()
        logger.info("Received request to delete document: %s (ID: %s) for user: %s",
                    doc.name, doc.id, request.user.username)

        try:
            # Trigger custom graph/vector cleanup using GraphBuilder
            builder = GraphBuilder()
            builder.delete_document_data(doc.id, request.user.id)

            # Delete physical file and SQL DB record
            doc.file.delete(save=False)
            doc.delete()

            logger.info("Successfully deleted document %s and cleaned associated graph/vector database records.", doc.name)
            return Response(
                {"message": "Document and all extracted nodes/vectors deleted successfully."},
                status=status.HTTP_200_OK
            )
        except Exception as e:
            logger.error("Failed to cleanly delete document ID: %s. Error: %s", doc.id, str(e), exc_info=True)
            return Response(
                {"error": "Failed to delete document."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ============================================================
# Endpoint #7: POST /api/query/
# ============================================================

class QueryView(APIView):
    """
    Endpoint for executing GraphRAG queries.
    Supports 'hybrid', 'vector', and 'graph' retrieval modes.
    """
    permission_classes = [IsAuthenticated]
    throttle_classes = [LLMLoadThrottle]

    def post(self, request):
        query = request.data.get("query")
        mode = request.data.get("mode", "hybrid")

        if not query or not query.strip():
            return Response(
                {"error": "The 'query' field is required and cannot be empty."},
                status=status.HTTP_400_BAD_REQUEST
            )

        logger.info("Executing RAG Query for user: %s | Mode: %s", request.user.username, mode)
        start_time = time.time()
        try:
            rag_chain = RAGChain()
            result = rag_chain.generate_answer(query, request.user.id, mode)
            elapsed = time.time() - start_time

            # Log query
            QueryLog.objects.create(
                user=request.user,
                query_text=query,
                retrieval_mode=mode.upper(),
                answer_text=result.get("answer", ""),
                response_time=round(elapsed, 3)
            )

            if result.get("success", False):
                return Response(result, status=status.HTTP_200_OK)
            else:
                return Response(
                    {"error": "Failed to generate RAG response."},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
        except Exception as e:
            elapsed = time.time() - start_time
            logger.error("Error in QueryView: %s", str(e), exc_info=True)
            QueryLog.objects.create(
                user=request.user,
                query_text=query,
                retrieval_mode=mode.upper(),
                answer_text="ERROR",
                response_time=round(elapsed, 3)
            )
            return Response(
                {"error": "An internal error occurred while processing your query."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ============================================================
# Endpoint #8: POST /api/query/graph-only/
# ============================================================

class GraphOnlyQueryView(APIView):
    """Dedicated endpoint for graph-only retrieval."""
    permission_classes = [IsAuthenticated]
    throttle_classes = [LLMLoadThrottle]

    def post(self, request):
        query = request.data.get("query")
        if not query or not query.strip():
            return Response(
                {"error": "The 'query' field is required and cannot be empty."},
                status=status.HTTP_400_BAD_REQUEST
            )

        start_time = time.time()
        try:
            rag_chain = RAGChain()
            result = rag_chain.generate_answer(query, request.user.id, mode="graph")
            elapsed = time.time() - start_time

            QueryLog.objects.create(
                user=request.user, query_text=query,
                retrieval_mode='GRAPH',
                answer_text=result.get("answer", ""),
                response_time=round(elapsed, 3)
            )

            if result.get("success", False):
                return Response(result, status=status.HTTP_200_OK)
            return Response(
                {"error": "Failed to generate graph retrieval response."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        except Exception as e:
            logger.error("Error in GraphOnlyQueryView: %s", str(e), exc_info=True)
            return Response(
                {"error": "An internal error occurred during graph retrieval."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ============================================================
# Endpoint #9: POST /api/query/vector-only/
# ============================================================

class VectorOnlyQueryView(APIView):
    """Dedicated endpoint for vector-only retrieval."""
    permission_classes = [IsAuthenticated]
    throttle_classes = [LLMLoadThrottle]

    def post(self, request):
        query = request.data.get("query")
        if not query or not query.strip():
            return Response(
                {"error": "The 'query' field is required and cannot be empty."},
                status=status.HTTP_400_BAD_REQUEST
            )

        start_time = time.time()
        try:
            rag_chain = RAGChain()
            result = rag_chain.generate_answer(query, request.user.id, mode="vector")
            elapsed = time.time() - start_time

            QueryLog.objects.create(
                user=request.user, query_text=query,
                retrieval_mode='VECTOR',
                answer_text=result.get("answer", ""),
                response_time=round(elapsed, 3)
            )

            if result.get("success", False):
                return Response(result, status=status.HTTP_200_OK)
            return Response(
                {"error": "Failed to generate vector retrieval response."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        except Exception as e:
            logger.error("Error in VectorOnlyQueryView: %s", str(e), exc_info=True)
            return Response(
                {"error": "An internal error occurred during vector retrieval."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ============================================================
# Endpoint #10: POST /api/query/compare/
# ============================================================

class QueryCompareView(APIView):
    """Runs all 3 retrieval modes and returns side-by-side comparison."""
    permission_classes = [IsAuthenticated]
    throttle_classes = [UserRateThrottle]

    def post(self, request):
        query = request.data.get("query")
        if not query or not query.strip():
            return Response(
                {"error": "The 'query' field is required and cannot be empty."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            rag_chain = RAGChain()
            results = {}
            results_lock = threading.Lock()

            def run_mode(mode: str) -> tuple:
                start = time.time()
                result = rag_chain.generate_answer(query, request.user.id, mode)
                elapsed = time.time() - start
                return mode, {
                    "answer": result.get("answer", ""),
                    "sources": result.get("sources", []),
                    "strategy": result.get("strategy", mode.upper()),
                    "response_time": round(elapsed, 3),
                    "success": result.get("success", False),
                    "confidence": result.get("confidence", 0.0),
                    "highlighted_entities": result.get("highlighted_entities", []),
                }

            with ThreadPoolExecutor(max_workers=3) as executor:
                futures = [executor.submit(run_mode, m) for m in ["graph", "vector", "hybrid"]]
                for future in as_completed(futures):
                    mode, data = future.result()
                    with results_lock:
                        results[mode] = data

            return Response({
                "query": query,
                "comparisons": results,
                "success": True
            }, status=status.HTTP_200_OK)

        except Exception as e:
            logger.error("Error in QueryCompareView: %s", str(e), exc_info=True)
            return Response(
                {"error": "An internal error occurred during comparison."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ============================================================
# Endpoint #11: GET /api/graph/
# ============================================================

class GraphDataView(APIView):
    """Returns full graph data (nodes + edges) for frontend visualization."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            graph_retriever = GraphRetriever()
            graph_json = graph_retriever.get_graph_as_json(request.user.id)
            return Response(graph_json, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error("Error in GraphDataView: %s", str(e), exc_info=True)
            return Response(
                {"error": "Failed to retrieve graph data."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ============================================================
# Endpoint #12: GET /api/graph/entity/{name}/
# ============================================================

class GraphEntityDetailView(APIView):
    """Returns entity details and its direct subgraph."""
    permission_classes = [IsAuthenticated]

    def get(self, request, name):
        if not name:
            return Response(
                {"error": "Entity name is required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            neo4j_client = Neo4jClient()
            entity_data = neo4j_client.get_entity_details(name, request.user.id)

            if not entity_data:
                return Response(
                    {"error": f"Entity '{name}' not found."},
                    status=status.HTTP_404_NOT_FOUND
                )

            return Response(entity_data, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error("Error in GraphEntityDetailView: %s", str(e), exc_info=True)
            return Response(
                {"error": "Failed to retrieve entity details."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ============================================================
# Endpoint #13: GET /api/graph/path/
# ============================================================

class GraphPathView(APIView):
    """Finds paths between two entities. Moved from /query/shortest-path/."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        entity_a = request.query_params.get("entity_a")
        entity_b = request.query_params.get("entity_b")

        if not entity_a or not entity_b:
            return Response(
                {"error": "Both 'entity_a' and 'entity_b' query parameters are required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            reasoner = MultiHopReasoner()
            result = reasoner.explain_connection(entity_a, entity_b, request.user.id)
            return Response(result, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error("Error in GraphPathView: %s", str(e), exc_info=True)
            return Response(
                {"error": "Failed to find path between entities."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ============================================================
# Endpoint #14: POST /api/graph/cypher/
# ============================================================

class GraphCypherView(APIView):
    """Executes raw Cypher query. Moved from /query/cypher/."""
    permission_classes = [IsAuthenticated]
    throttle_classes = [LLMLoadThrottle]

    def post(self, request):
        query = request.data.get("query")
        if not query or not query.strip():
            return Response(
                {"error": "The 'query' field is required and cannot be empty."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            nl_to_cypher = NLToCypher()
            result = nl_to_cypher.execute_nl_query(query, request.user.id)

            if result.get("success", False):
                return Response(result, status=status.HTTP_200_OK)
            return Response(
                {"error": "Failed to translate and execute Cypher query."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        except Exception as e:
            logger.error("Error in GraphCypherView: %s", str(e), exc_info=True)
            return Response(
                {"error": "An internal error occurred while executing Cypher."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ============================================================
# Endpoint #15: GET /api/graph/stats/
# ============================================================

class GraphStatsView(APIView):
    """Returns graph statistics: total nodes, edges, type distribution."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            neo4j_client = Neo4jClient()
            stats = neo4j_client.get_graph_statistics(request.user.id)
            return Response(stats, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error("Error in GraphStatsView: %s", str(e), exc_info=True)
            return Response(
                {"error": "Failed to retrieve graph statistics."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ============================================================
# Endpoint #16: GET /api/graph/communities/
# ============================================================

class CommunityListView(APIView):
    """Lists all detected communities with summaries."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            detector = CommunityDetector()
            communities = detector.get_all_communities(request.user.id)
            doc_summary = detector.get_document_summary(request.user.id)

            # Simplify response — don't send full member_details in list
            summary_list = []
            for comm in communities:
                summary_list.append({
                    "id": comm["id"],
                    "label": comm.get("label", ""),
                    "summary": comm.get("summary", ""),
                    "member_count": comm["member_count"],
                    "members": comm["members"]
                })

            return Response({
                "communities": summary_list,
                "count": len(summary_list),
                "document_summary": doc_summary
            }, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error("Error in CommunityListView: %s", str(e), exc_info=True)
            return Response(
                {"error": "Failed to retrieve communities."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ============================================================
# Endpoint #17: GET /api/graph/communities/{id}/
# ============================================================

class CommunityDetailView(APIView):
    """Returns a single community's full details and members."""
    permission_classes = [IsAuthenticated]

    def get(self, request, community_id):
        try:
            detector = CommunityDetector()
            community = detector.get_community_by_id(int(community_id), request.user.id)

            if not community:
                return Response(
                    {"error": f"Community with ID {community_id} not found."},
                    status=status.HTTP_404_NOT_FOUND
                )

            return Response(community, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error("Error in CommunityDetailView: %s", str(e), exc_info=True)
            return Response(
                {"error": "Failed to retrieve community details."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ============================================================
# Endpoint #18: POST /api/graph/search/
# ============================================================

class GraphSearchView(APIView):
    """Search entities by name or description with fuzzy matching."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        search_term = request.query_params.get("q", "").strip()
        if not search_term:
            return Response(
                {"error": "The 'q' query parameter is required."},
                status=status.HTTP_400_BAD_REQUEST
            )
        return self._search(search_term, request)

    def post(self, request):
        search_term = request.data.get("query", "").strip()
        if not search_term:
            return Response(
                {"error": "The 'query' field is required and cannot be empty."},
                status=status.HTTP_400_BAD_REQUEST
            )
        return self._search(search_term, request)

    def _search(self, search_term, request):
        try:
            neo4j_client = Neo4jClient()
            results = neo4j_client.search_entities(search_term, request.user.id)

            return Response({
                "query": search_term,
                "results": results,
                "count": len(results)
            }, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error("Error in GraphSearchView: %s", str(e), exc_info=True)
            return Response(
                {"error": "Failed to search entities."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ============================================================
# Endpoint #21: GET /api/query/history/
# ============================================================

class QueryHistoryView(APIView):
    """Returns the authenticated user's recent query history."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            logs = QueryLog.objects.filter(user=request.user)[:50]
            serializer = QueryLogSerializer(logs, many=True)
            return Response({"results": serializer.data, "count": len(logs)})
        except Exception as e:
            logger.error("Error in QueryHistoryView: %s", str(e), exc_info=True)
            return Response(
                {"error": "Failed to retrieve query history."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ============================================================
# Endpoint #19: GET /api/evaluation/
# ============================================================

class EvaluationView(APIView):
    """Returns evaluation results comparing retrieval modes."""
    permission_classes = [IsAuthenticated]
    throttle_classes = [UserRateThrottle]

    MAX_EVAL_PAIRS = 5
    MAX_LLM_CALLS = 10

    def get(self, request):
        try:
            # Get evaluation pairs for this user (capped to prevent timeout)
            pairs = EvaluationPair.objects.filter(
                user=request.user, is_active=True
            )[:self.MAX_EVAL_PAIRS]

            if not pairs.exists():
                return Response({
                    "evaluations": [],
                    "message": "No evaluation pairs found. Create evaluation pairs first.",
                    "summary": None
                }, status=status.HTTP_200_OK)

            rag_chain = RAGChain()
            eval_results = []
            llm_calls = 0

            for pair in pairs:
                if llm_calls >= self.MAX_LLM_CALLS:
                    break
                modes_results = {}
                for mode in ["graph", "vector", "hybrid"]:
                    if llm_calls >= self.MAX_LLM_CALLS:
                        break
                    start = time.time()
                    result = rag_chain.generate_answer(
                        pair.question, request.user.id, mode
                    )
                    elapsed = time.time() - start
                    llm_calls += 1
                    modes_results[mode] = {
                        "answer": result.get("answer", ""),
                        "response_time": round(elapsed, 3),
                        "success": result.get("success", False)
                    }

                eval_results.append({
                    "question": pair.question,
                    "expected_answer": pair.expected_answer,
                    "results": modes_results
                })

            # Summary stats
            summary = {
                "total_pairs": len(eval_results),
                "llm_calls_used": llm_calls,
                "avg_response_times": {}
            }
            for mode in ["graph", "vector", "hybrid"]:
                times = [e["results"][mode]["response_time"] for e in eval_results if mode in e["results"]]
                summary["avg_response_times"][mode] = round(sum(times) / len(times), 3) if times else 0

            return Response({
                "evaluations": eval_results,
                "summary": summary
            }, status=status.HTTP_200_OK)

        except Exception as e:
            logger.error("Error in EvaluationView: %s", str(e), exc_info=True)
            return Response(
                {"error": "Failed to run evaluation."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ============================================================
# Legacy endpoints (kept for backwards compatibility)
# ============================================================

class CypherQueryView(APIView):
    """
    Legacy endpoint for converting natural language queries directly into Cypher.
    Kept at /api/query/cypher/ for backwards compatibility.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        query = request.data.get("query")

        if not query or not query.strip():
            return Response(
                {"error": "The 'query' field is required and cannot be empty."},
                status=status.HTTP_400_BAD_REQUEST
            )

        logger.info("Translating NL Query to Cypher for user: %s", request.user.username)
        try:
            nl_to_cypher = NLToCypher()
            result = nl_to_cypher.execute_nl_query(query, request.user.id)

            if result.get("success", False):
                return Response(result, status=status.HTTP_200_OK)
            else:
                return Response(
                    {"error": "Failed to translate and execute Cypher query."},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
        except Exception as e:
            logger.error("Error in CypherQueryView: %s", str(e), exc_info=True)
            return Response(
                {"error": "An internal error occurred while translating your query."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class ShortestPathView(APIView):
    """
    Legacy endpoint for finding and explaining the connection path between two entities.
    Kept at /api/query/shortest-path/ for backwards compatibility.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        entity_a = request.data.get("entity_a")
        entity_b = request.data.get("entity_b")

        if not entity_a or not entity_b:
            return Response(
                {"error": "Both 'entity_a' and 'entity_b' fields are required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        logger.info("Executing Shortest Path reasoning: '%s' to '%s' for user: %s",
                    entity_a, entity_b, request.user.username)
        try:
            reasoner = MultiHopReasoner()
            result = reasoner.explain_connection(entity_a, entity_b, request.user.id)
            return Response(result, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error("Error in ShortestPathView: %s", str(e), exc_info=True)
            return Response(
                {"error": "An internal error occurred while finding the path."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
