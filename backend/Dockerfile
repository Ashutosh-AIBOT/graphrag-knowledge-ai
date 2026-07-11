FROM python:3.11-slim AS base

# Prevent Python from writing .pyc files and enable unbuffered logging
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt /app/
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy backend codebase
COPY . /app/

# Create volume directories so they exist with the correct permissions in the image
RUN mkdir -p /app/chroma_db /app/uploaded_documents /app/logs /app/db

# Collect static files (no-op if no static files, but ready for future)
RUN python manage.py collectstatic --noinput 2>/dev/null || true

# Create non-root user for security
RUN groupadd -r appuser && useradd -r -g appuser -d /app -s /sbin/nologin appuser \
    && chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

EXPOSE 8000

# Health check against the /api/health/ endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:8000/api/health/ || exit 1

# Production command using gunicorn with auto-migrations
CMD ["sh", "-c", "python manage.py migrate && gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 4 --threads 2 --timeout 300 --access-logfile - --error-logfile -"]
