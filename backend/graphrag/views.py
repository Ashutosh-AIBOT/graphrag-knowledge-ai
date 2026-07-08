import logging
import threading

from rest_framework import status, viewsets
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.views import TokenObtainPairView
from django.contrib.auth import get_user_model
from .models import Document
from .serializers import (
    RegisterSerializer, 
    UserSerializer, 
    DocumentSerializer
)

from .services.rag_chain import RAGChain
from .services.nl_to_cypher import NLToCypher
from .services.multihop_reasoner import MultiHopReasoner


# Note: We will implement the background logic inside the existing GraphBuilder service
from .services.graph_builder import GraphBuilder

logger = logging.getLogger(__name__)

User = get_user_model()

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
            raise e


def trigger_ingestion_background(document_id, user_id):
    """
    Isolated target runner to execute ingestion processing inside a background thread.
    """
    logger.info("Background thread spawned for ingestion of document ID: %s", document_id)
    try:
        builder = GraphBuilder()
        builder.process_document(document_id, user_id)
        logger.info("Background ingestion completed successfully for document ID: %s", document_id)
    except Exception as e:
        logger.error("Critical error in background ingestion thread for document ID: %s. Error: %s", 
                     document_id, str(e), exc_info=True)


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
        
        # Save document record with initial PENDING status
        doc = Document.objects.create(
            user=request.user,
            name=file_obj.name,
            file=file_obj,
            status=Document.Status.PENDING
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


class DocumentViewSet(viewsets.ModelViewSet):
    """
    ViewSet for listing, retrieving details, and deleting user documents.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = DocumentSerializer
    # Viewset operations are automatically mapped to list, retrieve, destroy URLs by the router
    http_method_names = ['get', 'delete']

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
                {"error": f"Failed to delete document: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class QueryView(APIView):
    """
    Endpoint for executing GraphRAG queries.
    Supports 'hybrid', 'vector', and 'graph' retrieval modes.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        query = request.data.get("query")
        mode = request.data.get("mode", "hybrid")

        if not query or not query.strip():
            return Response(
                {"error": "The 'query' field is required and cannot be empty."},
                status=status.HTTP_400_BAD_REQUEST
            )

        logger.info("Executing RAG Query for user: %s | Mode: %s", request.user.username, mode)
        try:
            rag_chain = RAGChain()
            result = rag_chain.generate_answer(query, request.user.id, mode)
            
            if result.get("success", False):
                return Response(result, status=status.HTTP_200_OK)
            else:
                return Response(
                    {"error": result.get("answer", "Failed to generate RAG response.")},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
        except Exception as e:
            logger.error("Error in QueryView: %s", str(e), exc_info=True)
            return Response(
                {"error": f"Internal Server Error: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class CypherQueryView(APIView):
    """
    Endpoint for converting natural language queries directly into Cypher,
    executing them, and returning the raw records.
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
                    {"error": result.get("error", "Failed to translate and execute Cypher query.")},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
        except Exception as e:
            logger.error("Error in CypherQueryView: %s", str(e), exc_info=True)
            return Response(
                {"error": f"Internal Server Error: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class ShortestPathView(APIView):
    """
    Endpoint for finding and explaining the connection path between two entities.
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
                {"error": f"Internal Server Error: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
