from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    RegisterView,
    CustomTokenObtainPairView,
    DocumentViewSet,
    DocumentUploadView,
    QueryView,
    CypherQueryView,
    ShortestPathView
)

router = DefaultRouter()
router.register(r'documents', DocumentViewSet, basename='document')

urlpatterns = [
    # Authentication Endpoints
    path('auth/register/', RegisterView.as_view(), name='auth_register'),
    path('auth/login/', CustomTokenObtainPairView.as_view(), name='auth_login'),
    path('auth/token/refresh/', TokenRefreshView.as_view(), name='auth_token_refresh'),
    
    # Document Ingestion Endpoint (POST /api/documents/upload/)
    path('documents/upload/', DocumentUploadView.as_view(), name='document_upload'),
    
    # Retrieval Endpoints
    path('query/', QueryView.as_view(), name='query'),
    path('query/cypher/', CypherQueryView.as_view(), name='query_cypher'),
    path('query/shortest-path/', ShortestPathView.as_view(), name='query_shortest_path'),
    
    # Document management routes:
    # GET /api/documents/ -> lists all user documents
    # GET /api/documents/{id}/ -> gets processing status details
    # DELETE /api/documents/{id}/ -> deletes database metadata, Neo4j graph nodes, and Chroma vectors
    path('', include(router.urls)),
]

