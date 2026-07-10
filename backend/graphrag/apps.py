import os
import logging

from django.apps import AppConfig

logger = logging.getLogger(__name__)


class GraphRAGConfig(AppConfig):
    """
    Django app configuration for the graphrag application.
    Handles startup recovery of stuck documents and initialization.
    """
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'graphrag'
    verbose_name = 'GraphRAG Knowledge Graph'

    def ready(self):
        """
        Called when Django starts. Recovers documents stuck in PROCESSING state
        due to server restarts or unhandled crashes.
        """
        if os.environ.get('RUN_MAIN') or 'runserver' in os.environ.get('DJANGO_SETTINGS_MODULE', ''):
            self._recover_stuck_documents()

    def _recover_stuck_documents(self):
        """
        Reset any documents stuck in PROCESSING for more than 10 minutes back to FAILED.
        This handles server restarts mid-ingestion where threads died without cleanup.
        """
        try:
            from django.utils import timezone
            from datetime import timedelta

            Document = self.get_model('Document')
            threshold = timezone.now() - timedelta(minutes=10)

            stuck_docs = Document.objects.filter(
                status=Document.Status.PROCESSING,
                updated_at__lt=threshold
            )

            count = stuck_docs.update(
                status=Document.Status.FAILED,
                error_message='Server restart detected. Please re-upload the document.'
            )

            if count:
                logger.warning(
                    "Startup recovery: Reset %d stuck PROCESSING documents to FAILED.",
                    count
                )
            else:
                logger.info("Startup recovery: No stuck documents found.")

        except Exception as e:
            logger.error("Startup recovery failed: %s", str(e), exc_info=True)
