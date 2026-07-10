from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    # Built-in Django Admin Interface
    path('admin/', admin.site.urls),

    # Delegating all /api/ traffic to the graphrag sub-app
    path('api/', include('graphrag.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
