import os
import uuid
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from unittest.mock import patch, MagicMock

from .models import Document
from .services.graph_builder import GraphBuilder

User = get_user_model()

class GraphRAGTests(APITestCase):

    def setUp(self):
        # Create a default test user
        self.username = "testuser"
        self.email = "testuser@gmail.com"
        self.password = "SecurePassword1!"
        self.user = User.objects.create_user(
            username=self.username,
            email=self.email,
            password=self.password
        )

    # ================= AUTHENTICATION TESTS =================

    def test_registration_success(self):
        url = reverse('auth_register')
        data = {
            "username": "newuser",
            "email": "newuser@gmail.com",
            "password": "NewSecure1!",
            "confirm_password": "NewSecure1!"
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["message"], "User registered successfully.")
        self.assertIn("user", response.data)
        self.assertEqual(response.data["user"]["username"], "newuser")

    def test_registration_blocked_disposable_email(self):
        url = reverse('auth_register')
        data = {
            "username": "spammer",
            "email": "spammer@yopmail.com",
            "password": "SecurePassword1!",
            "confirm_password": "SecurePassword1!"
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)

    def test_registration_blocked_invalid_password(self):
        url = reverse('auth_register')
        data = {
            "username": "weakuser",
            "email": "weak@gmail.com",
            "password": "weakpassword",
            "confirm_password": "weakpassword"
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", response.data)

    def test_login_and_jwt_issuance(self):
        url = reverse('auth_login')
        data = {
            "username": self.username,
            "password": self.password
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

    def test_login_with_email_and_jwt_issuance(self):
        url = reverse('auth_login')
        data = {
            "username": self.email,
            "password": self.password
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

    # ================= DOCUMENT & INGESTION TESTS =================

    @patch('graphrag.views.trigger_ingestion_background')
    def test_document_creation_and_status(self, mock_trigger):
        # Login and get token
        self.client.force_authenticate(user=self.user)
        
        # Create a mock file
        test_file = SimpleUploadedFile("sample.txt", b"This is sample document content.", content_type="text/plain")
        
        url = reverse('document_upload')  # POST /api/documents/upload/
        response = self.client.post(url, {'file': test_file}, format='multipart')
        
        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        self.assertEqual(response.data["document"]["status"], "PENDING")
        self.assertEqual(response.data["document"]["name"], "sample.txt")
        mock_trigger.assert_called_once()

    @patch('graphrag.services.graph_builder.Neo4jClient')
    @patch('graphrag.services.graph_builder.EntityExtractor')
    @patch('graphrag.services.graph_builder.RelationshipExtractor')
    @patch('graphrag.services.graph_builder.VectorRetriever')
    def test_background_ingestion_pipeline(self, mock_vector, mock_rel, mock_ent, mock_neo):
        # Configure Mocks
        mock_ent_instance = mock_ent.return_value
        mock_ent_instance.extract_entities.return_value = [
            {"name": "Google", "type": "ORGANIZATION", "description": "Tech company"}
        ]
        
        mock_rel_instance = mock_rel.return_value
        mock_rel_instance.extract_relationships.return_value = []
        
        mock_vector_instance = mock_vector.return_value
        
        # Create Document instance
        test_file = SimpleUploadedFile("sample.txt", b"Google is a tech company.", content_type="text/plain")
        doc = Document.objects.create(
            user=self.user,
            name="sample.txt",
            file=test_file,
            status=Document.Status.PENDING
        )

        # Run orchestrator synchronously in test
        builder = GraphBuilder()
        builder.process_document(doc.id, self.user.id)

        # Refresh from database and check state
        doc.refresh_from_db()
        self.assertEqual(doc.status, Document.Status.COMPLETED)
        self.assertEqual(doc.entity_count, 1)
        self.assertEqual(doc.relationship_count, 0)
        
        # Verify vector store index was called
        mock_vector_instance.index_document.assert_called_once()
