---
title: GraphRAG Knowledge AI Backend
emoji: 🤖
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 8000
pinned: false
---

# GraphRAG Knowledge AI Backend

This is the backend service for the GraphRAG Knowledge AI Platform built using Django, Django REST Framework, Neo4j, and ChromaDB.

## Running Locally

To run this backend locally, make sure you have Neo4j running:

```bash
docker run --name neo4j -p 7474:7474 -p 7687:7687 -e NEO4J_AUTH=neo4j/password neo4j:latest
```

Then run the Django server:

```bash
python manage.py runserver
```
