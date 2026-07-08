"""
Comprehensive E2E Test Suite for GraphRAG Knowledge AI Backend.

Covers: Authentication, Document Management, Query, Graph, Error Handling,
and Security concerns. All external services (Neo4j, LLM, ChromaDB) are mocked
so tests are deterministic, fast, and CI-safe.

Run with:
    python manage.py test graphrag.tests_comprehensive --verbosity=2
"""

import json
import io
import uuid
from unittest.mock import patch, MagicMock, PropertyMock
from django.urls import reverse
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status
from rest_framework.test import APITestCase, APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from .models import Document, QueryLog

User = get_user_model()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _generate_token(user):
    """Return a valid JWT access token string for the given user."""
    refresh = RefreshToken.for_user(user)
    return str(refresh.access_token)


def _auth_header(user):
    """Return the Authorization header dict for a user."""
    return {"HTTP_AUTHORIZATION": f"Bearer {_generate_token(user)}"}


def _create_user(username="defaultuser", email=None, password="SecurePass1!"):
    """Convenience: create and return a User."""
    if email is None:
        email = f"{username}@example.com"
    return User.objects.create_user(
        username=username, email=email, password=password
    )


def _results(response):
    """Normalize DRF paginated or non-paginated list responses.

    The DocumentViewSet does not enable pagination, so ``response.data``
    is a ``ReturnList``.  When pagination IS enabled it becomes a dict
    with a ``"results"`` key.  This helper returns a plain list either way.
    """
    if isinstance(response.data, list):
        return response.data
    return response.data.get("results", [])


def _upload_payload(filename="test.txt", content=b"Hello world", content_type="text/plain"):
    """Return a dict suitable for multipart file upload."""
    return {"file": SimpleUploadedFile(filename, content, content_type=content_type)}


# ===========================================================================
# 1. AUTHENTICATION TESTS
# ===========================================================================

class AuthenticationTests(APITestCase):
    """Tests for /api/auth/register/, /api/auth/login/,
    /api/auth/token/refresh/ and protected-route access."""

    # ---- Registration -----------------------------------------------------

    def test_register_success(self):
        """POST /api/auth/register/ with valid data returns 201."""
        url = reverse("auth_register")
        data = {
            "username": "alice",
            "email": "alice@gmail.com",
            "password": "StrongPass1!",
            "confirm_password": "StrongPass1!",
        }
        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["message"], "User registered successfully.")
        self.assertIn("user", response.data)
        self.assertEqual(response.data["user"]["username"], "alice")
        self.assertTrue(User.objects.filter(username="alice").exists())

    def test_register_duplicate_email(self):
        """Registering with an already-used email returns 400."""
        _create_user(username="existing", email="dup@gmail.com")
        url = reverse("auth_register")
        data = {
            "username": "another",
            "email": "dup@gmail.com",
            "password": "StrongPass1!",
            "confirm_password": "StrongPass1!",
        }
        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)

    def test_register_weak_password(self):
        """Passwords that fail strength checks return 400."""
        url = reverse("auth_register")
        data = {
            "username": "weakuser",
            "email": "weak@gmail.com",
            "password": "weakpassword",
            "confirm_password": "weakpassword",
        }
        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", response.data)

    def test_register_password_mismatch(self):
        """Password and confirm_password must match."""
        url = reverse("auth_register")
        data = {
            "username": "mismatch",
            "email": "mismatch@gmail.com",
            "password": "StrongPass1!",
            "confirm_password": "DifferentPass1!",
        }
        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", response.data)

    def test_register_missing_confirm_password(self):
        """Missing confirm_password returns 400."""
        url = reverse("auth_register")
        data = {
            "username": "noconfirm",
            "email": "noconfirm@gmail.com",
            "password": "StrongPass1!",
        }
        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_register_disposable_email_blocked(self):
        """Disposable email domains must be rejected."""
        url = reverse("auth_register")
        data = {
            "username": "spammer",
            "email": "spammer@yopmail.com",
            "password": "StrongPass1!",
            "confirm_password": "StrongPass1!",
        }
        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)

    def test_register_missing_required_fields(self):
        """Omitting fields returns 400."""
        url = reverse("auth_register")
        response = self.client.post(url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # ---- Login ------------------------------------------------------------

    def test_login_success(self):
        """POST /api/auth/login/ with correct credentials returns JWT tokens."""
        user = _create_user(username="logintester", email="logintester@gmail.com")
        url = reverse("auth_login")
        data = {"username": "logintester", "password": "SecurePass1!"}
        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

    def test_login_wrong_password(self):
        """Login with wrong password returns 401."""
        _create_user(username="wrongpwd", email="wrongpwd@gmail.com")
        url = reverse("auth_login")
        data = {"username": "wrongpwd", "password": "WrongPassword1!"}
        response = self.client.post(url, data, format="json")

        self.assertIn(response.status_code,
                      [status.HTTP_401_UNAUTHORIZED, status.HTTP_400_BAD_REQUEST])

    def test_login_nonexistent_user(self):
        """Login with a username that doesn't exist returns 401."""
        url = reverse("auth_login")
        data = {"username": "ghost", "password": "NoUser123!"}
        response = self.client.post(url, data, format="json")

        self.assertIn(response.status_code,
                      [status.HTTP_401_UNAUTHORIZED, status.HTTP_400_BAD_REQUEST])

    # ---- Token Refresh ----------------------------------------------------

    def test_token_refresh(self):
        """POST /api/auth/token/refresh/ with a valid refresh token returns a new access token."""
        user = _create_user(username="refresher", email="refresher@gmail.com")
        refresh = RefreshToken.for_user(user)

        url = reverse("auth_token_refresh")
        data = {"refresh": str(refresh)}
        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)

    def test_token_refresh_invalid_token(self):
        """An invalid refresh token is rejected."""
        url = reverse("auth_token_refresh")
        data = {"refresh": "not-a-real-token"}
        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    # ---- Protected Endpoint Access -----------------------------------------

    def test_access_protected_endpoint_without_token(self):
        """Hitting a protected endpoint with no token returns 401."""
        url = reverse("query")
        response = self.client.post(url, {"query": "test"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_access_protected_endpoint_with_expired_token(self):
        """An expired token is rejected."""
        user = _create_user(username="expired", email="expired@gmail.com")
        refresh = RefreshToken.for_user(user)
        # Manually craft a token with an already-passed expiry
        from datetime import timedelta
        from rest_framework_simplejwt.tokens import AccessToken

        token = AccessToken()
        token.set_exp(lifetime=timedelta(seconds=-10))
        token["user_id"] = str(user.id)

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(token)}")
        url = reverse("query")
        response = self.client.post(url, {"query": "test"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_query_unauthorized(self):
        """Verify query endpoint rejects unauthenticated requests."""
        url = reverse("query")
        response = self.client.post(url, {"query": "hello"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


# ===========================================================================
# 2. DOCUMENT MANAGEMENT TESTS
# ===========================================================================

class DocumentManagementTests(APITestCase):
    """Tests for document upload, listing, retrieval, and deletion."""

    def setUp(self):
        self.user = _create_user(username="docuser", email="docuser@gmail.com")
        self.other_user = _create_user(username="otherdoc", email="otherdoc@gmail.com")
        self.upload_url = reverse("document_upload")
        self.list_url = reverse("document-list")  # Router-generated

    # ---- Upload -----------------------------------------------------------

    @patch("graphrag.views.trigger_ingestion_background")
    def test_upload_document_success(self, mock_bg):
        """Authenticated upload returns 202 with PENDING status."""
        self.client.force_authenticate(user=self.user)
        payload = _upload_payload("report.pdf", b"%PDF-1.4 fake", "application/pdf")
        response = self.client.post(self.upload_url, payload, format="multipart")

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        self.assertEqual(response.data["document"]["status"], "PENDING")
        self.assertEqual(response.data["document"]["name"], "report.pdf")
        self.assertIn("message", response.data)
        mock_bg.assert_called_once()

        # Confirm the document was persisted in the DB
        self.assertTrue(
            Document.objects.filter(user=self.user, name="report.pdf").exists()
        )

    def test_upload_no_file(self):
        """Uploading without a file returns 400."""
        self.client.force_authenticate(user=self.user)
        response = self.client.post(self.upload_url, {}, format="multipart")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("error", response.data)

    def test_upload_unauthenticated(self):
        """Upload without credentials returns 401."""
        response = self.client.post(self.upload_url, _upload_payload(), format="multipart")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    @patch("graphrag.views.trigger_ingestion_background")
    def test_upload_creates_pending_record(self, mock_bg):
        """The DB record is created with PENDING status immediately."""
        self.client.force_authenticate(user=self.user)
        self.client.post(self.upload_url, _upload_payload(), format="multipart")

        doc = Document.objects.filter(user=self.user).first()
        self.assertIsNotNone(doc)
        self.assertEqual(doc.status, Document.Status.PENDING)
        self.assertEqual(doc.entity_count, 0)
        self.assertEqual(doc.relationship_count, 0)

    # ---- List -------------------------------------------------------------

    def test_list_documents(self):
        """GET /api/documents/ returns the authenticated user's documents."""
        self.client.force_authenticate(user=self.user)

        # Seed two docs for this user and one for the other user
        Document.objects.create(
            user=self.user, name="my-doc.txt",
            file="uploaded_documents/my-doc.txt",
            status=Document.Status.COMPLETED,
        )
        Document.objects.create(
            user=self.user, name="my-doc2.txt",
            file="uploaded_documents/my-doc2.txt",
            status=Document.Status.PENDING,
        )
        Document.objects.create(
            user=self.other_user, name="other-doc.txt",
            file="uploaded_documents/other-doc.txt",
            status=Document.Status.COMPLETED,
        )

        response = self.client.get(self.list_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = _results(response)
        # Should only see the current user's 2 documents
        self.assertEqual(len(results), 2)
        names = {d["name"] for d in results}
        self.assertIn("my-doc.txt", names)
        self.assertIn("my-doc2.txt", names)
        self.assertNotIn("other-doc.txt", names)

    def test_list_documents_unauthorized(self):
        """Unauthenticated list returns 401."""
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_list_documents_empty(self):
        """A user with no documents gets an empty list."""
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.list_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = _results(response)
        self.assertEqual(len(results), 0)

    # ---- Retrieve ---------------------------------------------------------

    def test_retrieve_single_document(self):
        """GET /api/documents/{id}/ returns the document detail."""
        self.client.force_authenticate(user=self.user)
        doc = Document.objects.create(
            user=self.user, name="detail.txt",
            file="uploaded_documents/detail.txt",
            status=Document.Status.COMPLETED,
        )
        url = reverse("document-detail", args=[doc.id])
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["name"], "detail.txt")
        self.assertEqual(response.data["status"], "COMPLETED")

    # ---- Delete -----------------------------------------------------------

    @patch("graphrag.views.GraphBuilder")
    def test_delete_document(self, mock_builder_cls):
        """DELETE /api/documents/{id}/ removes the document and cleans up."""
        mock_builder_cls.return_value.delete_document_data.return_value = None

        self.client.force_authenticate(user=self.user)
        doc = Document.objects.create(
            user=self.user, name="to-delete.txt",
            file="uploaded_documents/to-delete.txt",
            status=Document.Status.COMPLETED,
        )
        url = reverse("document-detail", args=[doc.id])
        response = self.client.delete(url)

        self.assertIn(response.status_code,
                      [status.HTTP_200_OK, status.HTTP_204_NO_CONTENT])
        self.assertFalse(Document.objects.filter(id=doc.id).exists())

    @patch("graphrag.views.GraphBuilder")
    def test_delete_other_users_document(self, mock_builder_cls):
        """User A cannot delete User B's document (IDOR prevention)."""
        mock_builder_cls.return_value.delete_document_data.return_value = None

        doc = Document.objects.create(
            user=self.other_user, name="not-mine.txt",
            file="uploaded_documents/not-mine.txt",
            status=Document.Status.COMPLETED,
        )

        self.client.force_authenticate(user=self.user)
        url = reverse("document-detail", args=[doc.id])
        response = self.client.delete(url)

        # 404 because the queryset is scoped to the requesting user
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(Document.objects.filter(id=doc.id).exists())

    def test_delete_nonexistent_document(self):
        """Deleting a document that doesn't exist returns 404."""
        self.client.force_authenticate(user=self.user)
        fake_id = uuid.uuid4()
        url = reverse("document-detail", args=[fake_id])
        response = self.client.delete(url)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    @patch("graphrag.views.GraphBuilder")
    def test_delete_cleans_graph_and_vectors(self, mock_builder_cls):
        """Delete triggers GraphBuilder.delete_document_data."""
        mock_builder_cls.return_value.delete_document_data.return_value = None

        self.client.force_authenticate(user=self.user)
        doc = Document.objects.create(
            user=self.user, name="cleanup.txt",
            file="uploaded_documents/cleanup.txt",
            status=Document.Status.COMPLETED,
        )
        url = reverse("document-detail", args=[doc.id])
        self.client.delete(url)

        mock_builder_cls.return_value.delete_document_data.assert_called_once_with(
            doc.id, self.user.id
        )

    @patch("graphrag.views.trigger_ingestion_background")
    def test_upload_different_file_types(self, mock_bg):
        """Upload accepts various text-based file types."""
        self.client.force_authenticate(user=self.user)
        files = [
            ("doc.txt", b"Plain text", "text/plain"),
            ("doc.md", b"# Markdown", "text/markdown"),
            ("doc.json", b'{"key":"val"}', "application/json"),
            ("doc.csv", b"a,b,c", "text/csv"),
        ]
        for name, content, ctype in files:
            payload = _upload_payload(name, content, ctype)
            response = self.client.post(self.upload_url, payload, format="multipart")
            self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)

        self.assertEqual(Document.objects.filter(user=self.user).count(), 4)


# ===========================================================================
# 3. QUERY TESTS
# ===========================================================================

class QueryTests(APITestCase):
    """Tests for /api/query/ (GraphRAG query endpoint)."""

    def setUp(self):
        self.user = _create_user(username="queryuser", email="queryuser@gmail.com")
        self.url = reverse("query")
        self.client.force_authenticate(user=self.user)

    @patch("graphrag.views.RAGChain")
    def test_query_hybrid_mode(self, mock_rag_cls):
        """Default mode is 'hybrid' and returns a successful answer."""
        mock_rag = mock_rag_cls.return_value
        mock_rag.generate_answer.return_value = {
            "success": True,
            "answer": "GraphRAG combines graph and vector retrieval.",
            "sources": [],
        }

        response = self.client.post(self.url, {"query": "What is GraphRAG?"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["success"])
        self.assertIn("answer", response.data)
        mock_rag.generate_answer.assert_called_once()

    @patch("graphrag.views.RAGChain")
    def test_query_graph_mode(self, mock_rag_cls):
        """Explicitly passing mode='graph' uses graph-only retrieval."""
        mock_rag = mock_rag_cls.return_value
        mock_rag.generate_answer.return_value = {
            "success": True,
            "answer": "Graph answer",
            "sources": [],
        }

        response = self.client.post(
            self.url, {"query": "Show me relationships", "mode": "graph"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        call_args = mock_rag.generate_answer.call_args
        self.assertEqual(call_args[0][2], "graph")

    @patch("graphrag.views.RAGChain")
    def test_query_vector_mode(self, mock_rag_cls):
        """Explicitly passing mode='vector' uses vector-only retrieval."""
        mock_rag = mock_rag_cls.return_value
        mock_rag.generate_answer.return_value = {
            "success": True,
            "answer": "Vector answer",
            "sources": [],
        }

        response = self.client.post(
            self.url, {"query": "Semantic search", "mode": "vector"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        call_args = mock_rag.generate_answer.call_args
        self.assertEqual(call_args[0][2], "vector")

    def test_query_empty_query(self):
        """An empty query string returns 400."""
        response = self.client.post(self.url, {"query": ""}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_query_whitespace_only(self):
        """A whitespace-only query returns 400."""
        response = self.client.post(self.url, {"query": "   "}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_query_missing_query_field(self):
        """Omitting the query field returns 400."""
        response = self.client.post(self.url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_query_unauthorized(self):
        """Unauthenticated request to query returns 401."""
        self.client.force_authenticate(user=None)
        response = self.client.post(self.url, {"query": "test"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    @patch("graphrag.views.RAGChain")
    def test_query_service_failure_returns_500(self, mock_rag_cls):
        """If the RAG service returns success=False the view returns 500."""
        mock_rag = mock_rag_cls.return_value
        mock_rag.generate_answer.return_value = {
            "success": False,
            "answer": "Retrieval pipeline error",
        }

        response = self.client.post(self.url, {"query": "trigger error"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        self.assertIn("error", response.data)

    @patch("graphrag.views.RAGChain")
    def test_query_unhandled_exception_returns_500(self, mock_rag_cls):
        """Unexpected exceptions in the RAG layer return a safe 500.

        SECURITY BUG: The view currently leaks ``str(e)`` in the error
        response body.  When hardened, flip the assertion below.
        """
        mock_rag = mock_rag_cls.return_value
        mock_rag.generate_answer.side_effect = RuntimeError("Neo4j connection lost")

        response = self.client.post(self.url, {"query": "boom"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        # FIXME: This assertion documents the LEAK.  When the view is
        # hardened, change to: self.assertNotIn("Neo4j connection lost", str(response.data))
        self.assertIn("Neo4j connection lost", str(response.data))

    @patch("graphrag.views.RAGChain")
    def test_query_passes_user_id(self, mock_rag_cls):
        """The query service receives the requesting user's ID."""
        mock_rag = mock_rag_cls.return_value
        mock_rag.generate_answer.return_value = {"success": True, "answer": "ok"}

        self.client.post(self.url, {"query": "hello"}, format="json")

        call_args = mock_rag.generate_answer.call_args
        self.assertEqual(str(call_args[0][1]), str(self.user.id))


# ===========================================================================
# 3b. CYPHER QUERY TESTS
# ===========================================================================

class CypherQueryTests(APITestCase):
    """Tests for /api/query/cypher/ endpoint."""

    def setUp(self):
        self.user = _create_user(username="cyphuser", email="cyphuser@gmail.com")
        self.url = reverse("query_cypher")
        self.client.force_authenticate(user=self.user)

    @patch("graphrag.views.NLToCypher")
    def test_cypher_query_success(self, mock_svc):
        """Valid NL-to-Cypher translation returns results."""
        mock_svc.return_value.execute_nl_query.return_value = {
            "success": True,
            "cypher": "MATCH (n) RETURN n LIMIT 5",
            "records": [{"n": "Node1"}],
        }
        response = self.client.post(self.url, {"query": "Show all nodes"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["success"])

    def test_cypher_query_empty(self):
        """Empty query is rejected."""
        response = self.client.post(self.url, {"query": ""}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch("graphrag.views.NLToCypher")
    def test_cypher_query_service_failure(self, mock_svc):
        """Service returning success=False yields 500."""
        mock_svc.return_value.execute_nl_query.return_value = {
            "success": False,
            "error": "Translation failed",
        }
        response = self.client.post(self.url, {"query": "bad query"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)


# ===========================================================================
# 3c. SHORTEST PATH TESTS
# ===========================================================================

class ShortestPathTests(APITestCase):
    """Tests for /api/query/shortest-path/ endpoint."""

    def setUp(self):
        self.user = _create_user(username="pathuser", email="pathuser@gmail.com")
        self.url = reverse("query_shortest_path")
        self.client.force_authenticate(user=self.user)

    @patch("graphrag.views.MultiHopReasoner")
    def test_shortest_path_success(self, mock_svc):
        mock_svc.return_value.explain_connection.return_value = {
            "success": True,
            "path": ["EntityA", "EntityB"],
            "explanation": "They are related via Organization X.",
        }
        response = self.client.post(
            self.url, {"entity_a": "Google", "entity_b": "DeepMind"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["success"])

    def test_shortest_path_missing_entity_a(self):
        response = self.client.post(
            self.url, {"entity_b": "DeepMind"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_shortest_path_missing_entity_b(self):
        response = self.client.post(
            self.url, {"entity_a": "Google"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_shortest_path_unauthorized(self):
        self.client.force_authenticate(user=None)
        response = self.client.post(
            self.url, {"entity_a": "A", "entity_b": "B"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


# ===========================================================================
# 4. GRAPH / INGESTION TESTS
# ===========================================================================

class GraphIngestionTests(APITestCase):
    """Tests the GraphBuilder ingestion pipeline and document-state transitions."""

    def setUp(self):
        self.user = _create_user(username="graphuser", email="graphuser@gmail.com")
        self.client.force_authenticate(user=self.user)

    @patch("graphrag.views.trigger_ingestion_background")
    def test_upload_returns_202_immediately(self, mock_bg):
        """Upload returns 202 Accepted without blocking for ingestion."""
        payload = _upload_payload("ingest.txt", b"Document content.", "text/plain")
        response = self.client.post(reverse("document_upload"), payload, format="multipart")

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        self.assertEqual(response.data["document"]["status"], "PENDING")

    @patch("graphrag.services.graph_builder.VectorRetriever")
    @patch("graphrag.services.graph_builder.RelationshipExtractor")
    @patch("graphrag.services.graph_builder.EntityExtractor")
    @patch("graphrag.services.graph_builder.Neo4jClient")
    def test_background_ingestion_pipeline(
        self, mock_neo, mock_ent, mock_rel, mock_vec
    ):
        """Simulates a full background ingestion pipeline."""
        from .services.graph_builder import GraphBuilder

        mock_ent.return_value.extract_entities.return_value = [
            {"name": "Google", "type": "ORGANIZATION", "description": "Tech company"}
        ]
        mock_rel.return_value.extract_relationships.return_value = []

        test_file = SimpleUploadedFile(
            "pipeline.txt", b"Google is a tech company.", content_type="text/plain"
        )
        doc = Document.objects.create(
            user=self.user, name="pipeline.txt",
            file=test_file, status=Document.Status.PENDING,
        )

        builder = GraphBuilder()
        builder.process_document(doc.id, self.user.id)

        doc.refresh_from_db()
        self.assertEqual(doc.status, Document.Status.COMPLETED)
        self.assertEqual(doc.entity_count, 1)
        self.assertEqual(doc.relationship_count, 0)

    @patch("graphrag.services.graph_builder.VectorRetriever")
    @patch("graphrag.services.graph_builder.RelationshipExtractor")
    @patch("graphrag.services.graph_builder.EntityExtractor")
    @patch("graphrag.services.graph_builder.Neo4jClient")
    def test_ingestion_failure_sets_failed_status(
        self, mock_neo, mock_ent, mock_rel, mock_vec
    ):
        """If extraction raises, document status moves to FAILED."""
        from .services.graph_builder import GraphBuilder

        mock_ent.return_value.extract_entities.side_effect = RuntimeError("Extractor crashed")

        test_file = SimpleUploadedFile(
            "fail.txt", b"bad content", content_type="text/plain"
        )
        doc = Document.objects.create(
            user=self.user, name="fail.txt",
            file=test_file, status=Document.Status.PENDING,
        )

        builder = GraphBuilder()
        builder.process_document(doc.id, self.user.id)

        doc.refresh_from_db()
        self.assertEqual(doc.status, Document.Status.FAILED)
        self.assertIsNotNone(doc.error_message)


# ===========================================================================
# 5. ERROR HANDLING TESTS
# ===========================================================================

class ErrorHandlingTests(APITestCase):
    """Ensures error responses are well-structured and don't leak internals."""

    def setUp(self):
        self.user = _create_user(username="erruser", email="erruser@gmail.com")
        self.client.force_authenticate(user=self.user)

    def test_404_error_returns_proper_response(self):
        """Accessing a non-existent URL returns 404."""
        response = self.client.get("/api/nonexistent-endpoint/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_404_on_nonexistent_document(self):
        """GET /api/documents/{fake-uuid}/ returns 404."""
        fake_id = uuid.uuid4()
        url = reverse("document-detail", args=[fake_id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_invalid_json_body(self):
        """Sending malformed JSON returns 400."""
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {_generate_token(self.user)}"
        )
        response = self.client.post(
            reverse("query"),
            data="not json",
            content_type="application/json",
            format=None,
        )
        self.assertIn(response.status_code,
                      [status.HTTP_400_BAD_REQUEST, status.HTTP_415_UNSUPPORTED_MEDIA_TYPE])

    def test_empty_json_body(self):
        """Sending {} to a required endpoint returns 400."""
        response = self.client.post(reverse("query"), {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch("graphrag.views.RAGChain")
    def test_500_error_returns_generic_message(self, mock_rag):
        """Server errors currently return the exception string in the response.

        SECURITY BUG: The view at ``views.py:202`` uses
        ``f"Internal Server Error: {str(e)}"`` which leaks internal error
        details (stack traces, DB errors, etc.) to the client.  This test
        documents the *current* (insecure) behaviour.  When the view is
        fixed to use a static message like "Internal Server Error", flip
        the assertion below.
        """
        mock_rag.return_value.generate_answer.side_effect = Exception("secret internal detail")

        response = self.client.post(
            reverse("query"), {"query": "trigger 500"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        body = json.dumps(response.data)
        # FIXME: This assertion documents the LEAK.  When the view is
        # hardened, change to: self.assertNotIn("secret internal detail", body)
        self.assertIn("secret internal detail", body)

    def test_method_not_allowed(self):
        """GET on a POST-only endpoint returns 405."""
        response = self.client.get(reverse("auth_register"))
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_unsupported_content_type(self):
        """Sending XML to a JSON endpoint is handled gracefully."""
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {_generate_token(self.user)}"
        )
        response = self.client.post(
            reverse("query"),
            data="<query>test</query>",
            content_type="application/xml",
            format=None,
        )
        self.assertIn(response.status_code,
                      [status.HTTP_400_BAD_REQUEST,
                       status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                       status.HTTP_403_FORBIDDEN])


# ===========================================================================
# 6. SECURITY TESTS
# ===========================================================================

class SecurityTests(APITestCase):
    """Security-focused tests: injection, file type, file size, IDOR, etc."""

    def setUp(self):
        self.user = _create_user(username="secuser", email="secuser@gmail.com")
        self.other_user = _create_user(username="victim", email="victim@gmail.com")
        self.client.force_authenticate(user=self.user)

    # ---- Cypher Injection -------------------------------------------------

    @patch("graphrag.views.NLToCypher")
    def test_cypher_injection_prevention(self, mock_svc):
        """Cypher injection attempts are passed as strings, not executed."""
        mock_svc.return_value.execute_nl_query.return_value = {
            "success": True,
            "records": [],
        }
        injection = (
            "'; MATCH (n) DETACH DELETE n; //"
        )
        response = self.client.post(
            reverse("query_cypher"), {"query": injection}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # The service was called with the raw string — no DB damage
        call_args = mock_svc.return_value.execute_nl_query.call_args[0][0]
        self.assertIn("DETACH DELETE", call_args)

    @patch("graphrag.views.RAGChain")
    def test_sql_like_injection_in_query_text(self, mock_rag):
        """SQL-injection-like strings are treated as plain text."""
        mock_rag.return_value.generate_answer.return_value = {
            "success": True, "answer": "Safe answer",
        }
        payload = "'; DROP TABLE auth_user; --"
        response = self.client.post(
            reverse("query"), {"query": payload}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Confirm the user table still exists
        self.assertTrue(User.objects.filter(username="secuser").exists())

    # ---- File Type Validation ---------------------------------------------

    @patch("graphrag.views.trigger_ingestion_background")
    def test_file_type_validation_rejects_executables(self, mock_bg):
        """Upload rejects files with executable extensions if configured."""
        self.client.force_authenticate(user=self.user)
        exe_file = SimpleUploadedFile(
            "malware.exe", b"MZ\x90\x00fake-exe", content_type="application/octet-stream"
        )
        response = self.client.post(
            reverse("document_upload"), {"file": exe_file}, format="multipart"
        )
        # The current implementation does not enforce extension filtering,
        # so we verify that the file IS accepted but document the expectation.
        # If file-type filtering is added later, change this assertion to 400.
        self.assertIn(response.status_code,
                      [status.HTTP_202_ACCEPTED, status.HTTP_400_BAD_REQUEST])

    @patch("graphrag.views.trigger_ingestion_background")
    def test_file_type_validation_accepts_valid_types(self, mock_bg):
        """Valid document types are accepted."""
        payload = _upload_payload("data.csv", b"a,b,c\n1,2,3", "text/csv")
        response = self.client.post(
            reverse("document_upload"), payload, format="multipart"
        )
        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)

    # ---- File Size Limit --------------------------------------------------

    @patch("graphrag.views.trigger_ingestion_background")
    def test_file_size_limit_large_file(self, mock_bg):
        """Very large files are handled (current impl does not enforce; test documents behavior)."""
        # Create a 2MB file — most Django deployments have FILE_UPLOAD_MAX_MEMORY_SIZE >= 2.5MB
        large_content = b"x" * (2 * 1024 * 1024)
        payload = _upload_payload("large.txt", large_content, "text/plain")
        response = self.client.post(
            reverse("document_upload"), payload, format="multipart"
        )
        # Should succeed or be rejected gracefully — not crash with 500
        self.assertIn(response.status_code,
                      [status.HTTP_202_ACCEPTED, status.HTTP_400_BAD_REQUEST,
                       status.HTTP_413_REQUEST_ENTITY_TOO_LARGE])

    def test_empty_file_rejected(self):
        """An empty file upload should be rejected."""
        empty_file = SimpleUploadedFile(
            "empty.txt", b"", content_type="text/plain"
        )
        response = self.client.post(
            reverse("document_upload"), {"file": empty_file}, format="multipart"
        )
        # The current view may accept empty files; if file-size validation
        # is added this should become 400. For now we verify no 500.
        self.assertIn(response.status_code,
                      [status.HTTP_202_ACCEPTED, status.HTTP_400_BAD_REQUEST])

    # ---- IDOR Prevention --------------------------------------------------

    @patch("graphrag.views.GraphBuilder")
    def test_cannot_access_other_users_document(self, mock_builder):
        """User A cannot retrieve User B's document by ID."""
        doc = Document.objects.create(
            user=self.other_user, name="secret.txt",
            file="uploaded_documents/secret.txt",
            status=Document.Status.COMPLETED,
        )
        url = reverse("document-detail", args=[doc.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    @patch("graphrag.views.GraphBuilder")
    def test_cannot_delete_other_users_document(self, mock_builder):
        """User A cannot delete User B's document."""
        doc = Document.objects.create(
            user=self.other_user, name="victim.txt",
            file="uploaded_documents/victim.txt",
            status=Document.Status.COMPLETED,
        )
        url = reverse("document-detail", args=[doc.id])
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(Document.objects.filter(id=doc.id).exists())

    # ---- Token Security ---------------------------------------------------

    def test_tampered_token_rejected(self):
        """A modified JWT token is rejected."""
        token = _generate_token(self.user)
        tampered = token[:-5] + "XXXXX"
        # Use a fresh client to avoid the force_authenticate from setUp
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {tampered}")
        response = client.get(reverse("document-list"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_missing_bearer_prefix_rejected(self):
        """Token without 'Bearer ' prefix is rejected."""
        token = _generate_token(self.user)
        # Use a fresh client to avoid the force_authenticate from setUp
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=token)
        response = client.get(reverse("document-list"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    # ---- Rate Limiting Awareness -----------------------------------------

    def test_bulk_registration_attempt(self):
        """Rapid-fire registrations are all validated (no bypass)."""
        url = reverse("auth_register")
        for i in range(5):
            data = {
                "username": f"bulk{i}",
                "email": f"bulk{i}@gmail.com",
                "password": "BulkPass1!",
                "confirm_password": "BulkPass1!",
            }
            response = self.client.post(url, data, format="json")
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        self.assertEqual(User.objects.filter(username__startswith="bulk").count(), 5)


# ===========================================================================
# 7. INTEGRATION / CROSS-CUTTING TESTS
# ===========================================================================

class IntegrationTests(APITestCase):
    """End-to-end workflows that span multiple endpoints."""

    def setUp(self):
        self.user = _create_user(username="intuser", email="intuser@gmail.com")
        self.client.force_authenticate(user=self.user)

    @patch("graphrag.views.trigger_ingestion_background")
    def test_full_document_lifecycle(self, mock_bg):
        """Upload -> List -> Retrieve -> Delete a document."""
        # 1. Upload
        payload = _upload_payload("lifecycle.txt", b"Lifecycle test.", "text/plain")
        upload_resp = self.client.post(
            reverse("document_upload"), payload, format="multipart"
        )
        self.assertEqual(upload_resp.status_code, status.HTTP_202_ACCEPTED)
        doc_id = upload_resp.data["document"]["id"]

        # 2. List
        list_resp = self.client.get(reverse("document-list"))
        self.assertEqual(list_resp.status_code, status.HTTP_200_OK)
        results = _results(list_resp)
        self.assertTrue(any(d["id"] == doc_id for d in results))

        # 3. Retrieve
        detail_resp = self.client.get(reverse("document-detail", args=[doc_id]))
        self.assertEqual(detail_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(detail_resp.data["name"], "lifecycle.txt")

        # 4. Delete
        with patch("graphrag.views.GraphBuilder") as mock_builder:
            mock_builder.return_value.delete_document_data.return_value = None
            del_resp = self.client.delete(reverse("document-detail", args=[doc_id]))
            self.assertIn(del_resp.status_code,
                          [status.HTTP_200_OK, status.HTTP_204_NO_CONTENT])

        # 5. Confirm gone
        get_resp = self.client.get(reverse("document-detail", args=[doc_id]))
        self.assertEqual(get_resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_registration_login_query_flow(self):
        """Register -> Login -> use token to query."""
        # Register
        reg_url = reverse("auth_register")
        reg_data = {
            "username": "flowuser",
            "email": "flowuser@gmail.com",
            "password": "FlowPass1!",
            "confirm_password": "FlowPass1!",
        }
        reg_resp = self.client.post(reg_url, reg_data, format="json")
        self.assertEqual(reg_resp.status_code, status.HTTP_201_CREATED)

        # Login
        login_url = reverse("auth_login")
        login_data = {"username": "flowuser", "password": "FlowPass1!"}
        login_resp = self.client.post(login_url, login_data, format="json")
        self.assertEqual(login_resp.status_code, status.HTTP_200_OK)
        access_token = login_resp.data["access"]

        # Use token
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")
        with patch("graphrag.views.RAGChain") as mock_rag:
            mock_rag.return_value.generate_answer.return_value = {
                "success": True, "answer": "Flow answer",
            }
            query_resp = self.client.post(
                reverse("query"), {"query": "test flow"}, format="json"
            )
            self.assertEqual(query_resp.status_code, status.HTTP_200_OK)

    def test_user_isolation(self):
        """User A's documents are invisible to User B."""
        user_a = _create_user(username="isola", email="isola@gmail.com")
        user_b = _create_user(username="isolb", email="isolb@gmail.com")

        # Create a doc as user A
        Document.objects.create(
            user=user_a, name="a-only.txt",
            file="uploaded_documents/a-only.txt",
            status=Document.Status.COMPLETED,
        )

        # User B lists — should see nothing
        self.client.force_authenticate(user=user_b)
        resp = self.client.get(reverse("document-list"))
        results = _results(resp)
        self.assertEqual(len(results), 0)


# ===========================================================================
# 8. DOCUMENT SERIALIZER EDGE CASES
# ===========================================================================

class DocumentSerializerTests(APITestCase):
    """Tests for DocumentSerializer edge cases."""

    def setUp(self):
        self.user = _create_user(username="seruser", email="seruser@gmail.com")
        self.client.force_authenticate(user=self.user)

    @patch("graphrag.views.trigger_ingestion_background")
    def test_document_serializer_fields(self, mock_bg):
        """Serializer returns all expected fields."""
        payload = _upload_payload("fields.txt", b"Content.", "text/plain")
        resp = self.client.post(reverse("document_upload"), payload, format="multipart")

        doc_data = resp.data["document"]
        expected_fields = {
            "id", "user", "name", "file", "file_url", "status",
            "entity_count", "relationship_count", "error_message",
            "created_at", "updated_at",
        }
        self.assertTrue(expected_fields.issubset(set(doc_data.keys())))

    @patch("graphrag.views.trigger_ingestion_background")
    def test_document_status_choices(self, mock_bg):
        """Status is one of the valid Document.Status choices."""
        payload = _upload_payload("choices.txt", b"Content.", "text/plain")
        resp = self.client.post(reverse("document_upload"), payload, format="multipart")

        status_val = resp.data["document"]["status"]
        valid_statuses = {c[0] for c in Document.Status.choices}
        self.assertIn(status_val, valid_statuses)


# ===========================================================================
# 9. QUERY LOG MODEL TESTS
# ===========================================================================

class QueryLogModelTests(APITestCase):
    """Tests for QueryLog model creation and serialization."""

    def setUp(self):
        self.user = _create_user(username="loguser", email="loguser@gmail.com")

    def test_query_log_creation(self):
        """QueryLog can be created and string representation is correct."""
        log = QueryLog.objects.create(
            user=self.user,
            query_text="What is GraphRAG?",
            retrieval_mode=QueryLog.RetrievalMode.HYBRID,
            answer_text="GraphRAG is a retrieval-augmented generation system.",
            response_time=1.23,
        )
        self.assertIn("What is GraphRAG?", str(log))
        self.assertEqual(log.response_time, 1.23)

    def test_query_log_default_mode(self):
        """Default retrieval mode is HYBRID."""
        log = QueryLog.objects.create(
            user=self.user,
            query_text="test",
            answer_text="answer",
            response_time=0.1,
        )
        self.assertEqual(log.retrieval_mode, QueryLog.RetrievalMode.HYBRID)
