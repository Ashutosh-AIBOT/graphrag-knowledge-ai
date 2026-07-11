from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    HealthCheckView,
    RegisterView,
    CustomTokenObtainPairView,
    DocumentViewSet,
    DocumentUploadView,
    QueryView,
    GraphOnlyQueryView,
    VectorOnlyQueryView,
    QueryCompareView,
    QueryHistoryView,
    GraphDataView,
    GraphEntityDetailView,
    GraphPathView,
    GraphCypherView,
    GraphStatsView,
    CommunityListView,
    CommunityDetailView,
    GraphSearchView,
    EvaluationView,
    CypherQueryView,
    ShortestPathView,
)

router = DefaultRouter()
router.register(r'documents', DocumentViewSet, basename='document')

urlpatterns = [
    # === Health ===
    path('health/', HealthCheckView.as_view(), name='health'),

    # === Authentication ===
    path('auth/register/', RegisterView.as_view(), name='auth_register'),
    path('auth/login/', CustomTokenObtainPairView.as_view(), name='auth_login'),
    path('auth/token/refresh/', TokenRefreshView.as_view(), name='auth_token_refresh'),

    # === Documents ===
    path('documents/upload/', DocumentUploadView.as_view(), name='document_upload'),

    # === Query Endpoints ===
    path('query/', QueryView.as_view(), name='query'),
    path('query/graph-only/', GraphOnlyQueryView.as_view(), name='query_graph_only'),
    path('query/vector-only/', VectorOnlyQueryView.as_view(), name='query_vector_only'),
    path('query/compare/', QueryCompareView.as_view(), name='query_compare'),

    # === Legacy endpoints (kept for backwards compat) ===
    path('query/cypher/', CypherQueryView.as_view(), name='query_cypher'),
    path('query/shortest-path/', ShortestPathView.as_view(), name='query_shortest_path'),

    # === Graph Endpoints (NEW) ===
    path('graph/', GraphDataView.as_view(), name='graph_data'),
    path('graph/entity/<str:name>/', GraphEntityDetailView.as_view(), name='graph_entity_detail'),
    path('graph/path/', GraphPathView.as_view(), name='graph_path'),
    path('graph/cypher/', GraphCypherView.as_view(), name='graph_cypher'),
    path('graph/stats/', GraphStatsView.as_view(), name='graph_stats'),
    path('graph/communities/', CommunityListView.as_view(), name='graph_communities'),
    path('graph/communities/<int:community_id>/', CommunityDetailView.as_view(), name='graph_community_detail'),
    path('graph/search/', GraphSearchView.as_view(), name='graph_search'),

    # === Query History ===
    path('query/history/', QueryHistoryView.as_view(), name='query_history'),

    # === Evaluation ===
    path('evaluation/', EvaluationView.as_view(), name='evaluation'),

    # === Document Management (router) ===
    path('', include(router.urls)),
]
