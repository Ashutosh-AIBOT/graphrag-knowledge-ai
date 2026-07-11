#!/bin/bash
set -e

# Set Neo4j environment variables
export NEO4J_HOME="/app/neo4j"
export PATH="$NEO4J_HOME/bin:$PATH"

echo "Starting Neo4j database in the background..."
neo4j start

echo "Waiting for Neo4j to be ready on port 7474..."
max_retries=60
count=0
# Loop until Neo4j HTTP API responds (it will respond to a basic curl even if unauthenticated)
while ! curl -s http://localhost:7474 > /dev/null; do
    count=$((count+1))
    if [ $count -ge $max_retries ]; then
        echo "Error: Neo4j failed to start within 60 seconds."
        exit 1
    fi
    echo "Waiting for Neo4j... ($count/$max_retries)"
    sleep 2
done

echo "Neo4j is up and running!"

echo "Running Django database migrations..."
python manage.py migrate --noinput

echo "Starting Gunicorn web server..."
# Use exec to replace the shell with gunicorn so it receives OS signals properly
exec gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 4 --threads 2 --timeout 300 --access-logfile - --error-logfile -
