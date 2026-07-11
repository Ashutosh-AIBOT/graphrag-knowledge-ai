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
    wget \
    procps \
    default-jre \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt /app/
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy backend codebase
COPY . /app/

# Create volume directories so they exist with the correct permissions in the image
RUN mkdir -p /app/chroma_db /app/uploaded_documents /app/logs /app/db /app/db/neo4j_data

# Download and setup Neo4j Community Edition
RUN wget -q -O neo4j.tar.gz "https://neo4j.com/artifact.php?name=neo4j-community-5.23.0-unix.tar.gz" \
    && tar -xf neo4j.tar.gz \
    && mv neo4j-community-5.23.0 /app/neo4j \
    && rm neo4j.tar.gz

# Configure Neo4j to run within resource limits and set directories
RUN echo "server.directories.data=/app/db/neo4j_data" >> /app/neo4j/conf/neo4j.conf \
    && echo "server.memory.heap.initial_size=512m" >> /app/neo4j/conf/neo4j.conf \
    && echo "server.memory.heap.max_size=1G" >> /app/neo4j/conf/neo4j.conf \
    && echo "server.memory.pagecache.size=1G" >> /app/neo4j/conf/neo4j.conf

# Set default password (matches backend settings)
RUN /app/neo4j/bin/neo4j-admin dbms set-initial-password "password"

# Ensure start script is executable
RUN chmod +x /app/start.sh

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

# Production command using custom startup script to run both Neo4j and Gunicorn
CMD ["/app/start.sh"]
