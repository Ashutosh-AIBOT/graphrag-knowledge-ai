import uuid
from django.db import models
from django.contrib.auth.models import AbstractUser
from django.conf import settings

class User(AbstractUser):
    """
    Custom User Model to allow for seamless future attribute additions 
    without database schema breakage. Uses UUID as the primary key.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    def __str__(self):
        return self.username


class Document(models.Model):
    """
    Tracks uploaded documents, ingestion status, metadata, and error details.
    """
    class Status(models.TextChoices):
        PENDING = 'PENDING', 'Pending'
        PROCESSING = 'PROCESSING', 'Processing'
        COMPLETED = 'COMPLETED', 'Completed'
        FAILED = 'FAILED', 'Failed'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.CASCADE, 
        related_name='documents'
    )
    name = models.CharField(max_length=255)
    file = models.FileField(upload_to='uploaded_documents/')
    status = models.CharField(
        max_length=20, 
        choices=Status.choices, 
        default=Status.PENDING
    )
    entity_count = models.IntegerField(default=0)
    relationship_count = models.IntegerField(default=0)
    error_message = models.TextField(blank=True, null=True)
    source = models.CharField(max_length=255, blank=True, default='', help_text="Optional source label (e.g. research-paper, internal-wiki)")
    processing_progress = models.IntegerField(default=0, help_text="Progress percentage (0-100)")
    processing_step = models.CharField(max_length=200, blank=True, default='', help_text="Current processing step description")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.name} ({self.status})"


class QueryLog(models.Model):
    """
    Logs queries, selected retrieval strategies, generated answers, and response times.
    """
    class RetrievalMode(models.TextChoices):
        GRAPH = 'GRAPH', 'Graph Only'
        VECTOR = 'VECTOR', 'Vector Only'
        HYBRID = 'HYBRID', 'Hybrid'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.CASCADE, 
        related_name='query_logs'
    )
    query_text = models.TextField()
    retrieval_mode = models.CharField(
        max_length=20, 
        choices=RetrievalMode.choices, 
        default=RetrievalMode.HYBRID
    )
    answer_text = models.TextField()
    response_time = models.FloatField(help_text="Response time in seconds")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Query: {self.query_text[:30]}... ({self.retrieval_mode})"


class EvaluationPair(models.Model):
    """
    Stores target question-answer evaluation pairs to compute metrics against.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.CASCADE, 
        related_name='evaluation_pairs'
    )
    question = models.TextField()
    expected_answer = models.TextField()
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Question: {self.question[:40]}..."
