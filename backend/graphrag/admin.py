from django.contrib import admin
from .models import User, Document, QueryLog, EvaluationPair


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ('username', 'email', 'is_staff', 'date_joined')
    search_fields = ('username', 'email')


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ('name', 'user', 'status', 'entity_count', 'relationship_count', 'created_at')
    list_filter = ('status', 'created_at')
    search_fields = ('name',)
    readonly_fields = ('entity_count', 'relationship_count', 'error_message')


@admin.register(QueryLog)
class QueryLogAdmin(admin.ModelAdmin):
    list_display = ('query_text', 'user', 'retrieval_mode', 'response_time', 'created_at')
    list_filter = ('retrieval_mode', 'created_at')
    search_fields = ('query_text',)


@admin.register(EvaluationPair)
class EvaluationPairAdmin(admin.ModelAdmin):
    list_display = ('question', 'user', 'is_active', 'created_at')
    list_filter = ('is_active', 'created_at')
    search_fields = ('question',)
