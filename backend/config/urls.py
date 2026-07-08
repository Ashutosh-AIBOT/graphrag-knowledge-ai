from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    # Built-in Django Admin Interface
    path('admin/', admin.site.urls),
    
    # Delegating all /api/ traffic to the graphrag sub-app
    path('api/', include('graphrag.urls')),
]
