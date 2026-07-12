import re
import logging
from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from .models import Document, QueryLog, EvaluationPair

logger = logging.getLogger(__name__)
User = get_user_model()


DISPOSABLE_DOMAINS = {
    'mailinator.com', 'yopmail.com', 'tempmail.com', 'temp-mail.org', 
    '10minutemail.com', 'guerrillamail.com', 'trashmail.com'
}

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('id', 'username', 'email')

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=True, style={'input_type': 'password'})
    confirm_password = serializers.CharField(write_only=True, required=True, style={'input_type': 'password'})

    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'password', 'confirm_password')

    def create(self, validated_data):
        validated_data.pop('confirm_password')
        return User.objects.create_user(**validated_data)
    def validate_email(self, value):
        logger.debug("Validating email: %s", value)
        
        # 1. Format normalization
        value = value.strip().lower()
        
        # 2. Extract and check domain
        try:
            domain = value.split('@')[1]
        except IndexError:
            raise serializers.ValidationError("Invalid email address format.")
            
        if domain in DISPOSABLE_DOMAINS:
            logger.warning("Blocked attempt to register with fake/disposable email domain: %s", domain)
            raise serializers.ValidationError("Disposable or temporary email accounts are not permitted.")
            
        # 3. Check for uniqueness
        if User.objects.filter(email=value).exists():
            logger.warning("Registration failed - email already exists: %s", value)
            raise serializers.ValidationError("A user with this email already exists.")
            
        return value
        
    def validate(self, attrs):
        logger.debug("Checking password policies and password matching...")
        password = attrs.get('password')
        confirm_password = attrs.get('confirm_password')
        # 1. Verify match
        if password != confirm_password:
            raise serializers.ValidationError({"password": "Passwords do not match."})
        # 2. Blank / spaces-only check
        if not password or password.strip() == '':
            raise serializers.ValidationError({"password": "Password cannot be empty or contain only spaces."})
        # 3. Custom Strict Character Check (Uppercase, Lowercase, Number, Special Char)
        if not re.search(r"[A-Z]", password):
            raise serializers.ValidationError({"password": "Password must contain at least one uppercase letter."})
        if not re.search(r"[a-z]", password):
            raise serializers.ValidationError({"password": "Password must contain at least one lowercase letter."})
        if not re.search(r"[0-9]", password):
            raise serializers.ValidationError({"password": "Password must contain at least one number."})
        if not re.search(r"[@$!%*?&]", password):
            raise serializers.ValidationError({"password": "Password must contain at least one special character (@, $, !, %, *, ?, &)."})
        return attrs


class DocumentSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = Document
        fields = (
            'id', 'user', 'name', 'file', 'file_url', 'status', 
            'entity_count', 'relationship_count', 'error_message',
            'source', 'processing_progress', 'processing_step',
            'created_at', 'updated_at'
        )
        read_only_fields = (
            'id', 'user', 'status', 'entity_count', 'relationship_count', 
            'error_message', 'processing_progress', 'processing_step',
            'created_at', 'updated_at'
        )

    def get_file_url(self, obj):
        request = self.context.get('request')
        if obj.file and request:
            return request.build_absolute_uri(obj.file.url)
        return None


class QueryLogSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    answer_preview = serializers.SerializerMethodField()

    class Meta:
        model = QueryLog
        fields = (
            'id', 'user', 'query_text', 'retrieval_mode', 
            'answer_text', 'answer_preview', 'response_time', 'created_at'
        )
        read_only_fields = ('id', 'user', 'created_at')

    def get_answer_preview(self, obj):
        text = obj.answer_text or ""
        if len(text) > 200:
            return text[:200] + "..."
        return text


class EvaluationPairSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)

    class Meta:
        model = EvaluationPair
        fields = ('id', 'user', 'question', 'expected_answer', 'is_active', 'created_at')
        read_only_fields = ('id', 'user', 'created_at')
