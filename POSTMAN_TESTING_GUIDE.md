# Postman Testing Guide - GraphRAG Knowledge Graph AI API

## Complete Step-by-Step API Testing Guide for Django REST API with JWT Authentication

---

## Table of Contents

1. [Postman Installation & Setup](#1-postman-installation--setup)
2. [Creating a Collection](#2-creating-a-collection)
3. [Setting Up Environment Variables](#3-setting-up-environment-variables)
4. [Endpoint-by-Endpoint Testing Guide](#4-endpoint-by-endpoint-testing-guide)
5. [Chaining Requests with JWT Tokens](#5-chaining-requests-with-jwt-tokens)
6. [Writing Post-Response Tests](#6-writing-post-response-tests)
7. [Common Errors & Troubleshooting](#7-common-errors--troubleshooting)
8. [Using Postman Runner for Batch Testing](#8-using-postman-runner-for-batch-testing)

---

## 1. Postman Installation & Setup

### Step 1.1: Download Postman

```
1. Go to https://www.postman.com/downloads/
2. Choose your OS (Windows / Mac / Linux)
3. Download and run the installer
4. Sign up for a free account (optional but recommended for sync)
```

### Step 1.2: Verify Installation

```
Open Postman -> You should see the main workspace with:
- Left sidebar (Collections, History)
- Center panel (Request builder)
- Right panel (Response viewer)
```

### Step 1.3: Disable SSL Certificate Verification (for localhost)

```
1. Click the gear icon (Settings) in the top-right
2. Go to "General" tab
3. Turn OFF "SSL certificate verification"
4. This is needed because localhost often uses self-signed certs
```

---

## 2. Creating a Collection

### Step 2.1: Create the Collection

```
1. Click "Collections" in the left sidebar
2. Click the "+" button or "Create Collection"
3. Name it: "GraphRAG Knowledge Graph AI API"
4. Click the "..." next to the collection name -> "Edit"
5. Go to "Authorization" tab
6. Set Type to: "Bearer Token"
7. In the Token field, enter: {{access_token}}
8. Click "Save"
```

### Step 2.2: Organize with Folders

Right-click the collection and create these folders:

```
GraphRAG Knowledge Graph AI API/
├── 01 - Health Check
├── 02 - Authentication
├── 03 - Document Management
├── 04 - Query Endpoints
├── 05 - Graph Endpoints
└── 06 - Evaluation
```

To create a folder:
```
1. Right-click on the collection name
2. Select "Add Folder"
3. Name the folder
4. Drag requests into the appropriate folder
```

---

## 3. Setting Up Environment Variables

### Step 3.1: Create an Environment

```
1. Click the "Environments" tab in the left sidebar
2. Click "Create Environment"
3. Name it: "GraphRAG Local Dev"
4. Click "Add" to create variables
```

### Step 3.2: Add Variables

Add each of these variables with their initial values:

| Variable           | Initial Value            | Description                     |
|--------------------|--------------------------|---------------------------------|
| `base_url`         | `http://localhost:8000`   | API base URL                    |
| `access_token`     |                          | JWT access token (auto-filled)  |
| `refresh_token`    |                          | JWT refresh token (auto-filled) |
| `test_username`    | `testuser_01`            | Test user username              |
| `test_email`       | `testuser01@example.com` | Test user email                 |
| `test_password`    | `SecureP@ss1`            | Test user password              |
| `uploaded_doc_id`  |                          | Document ID (auto-filled)       |

### Step 3.3: Activate the Environment

```
1. Top-right corner: click the Environment dropdown
2. Select "GraphRAG Local Dev"
3. The eye icon shows current variable values
```

---

## 4. Endpoint-by-Endpoint Testing Guide

---

### ENDPOINT 1: POST /api/auth/register/

**Folder**: `02 - Authentication`

**Setup**:
```
Name: Register User
Method: POST
URL: {{base_url}}/api/auth/register/
```

**Headers**:
```
Content-Type: application/json
```

**Body** (raw JSON):
```json
{
    "username": "{{test_username}}",
    "email": "{{test_email}}",
    "password": "{{test_password}}",
    "confirm_password": "{{test_password}}"
}
```

**Expected Response**:
- Status: `201 Created`
- Body:
```json
{
    "message": "User registered successfully.",
    "user": {
        "id": 1,
        "username": "testuser_01",
        "email": "testuser01@example.com"
    }
}
```

**What to Check**:
- `message` field confirms success
- `user` object contains `id`, `username`, `email`
- No `password` field is returned (security!)

**Post-Response Script** (Tests tab):
```javascript
pm.test("Status code is 201", function () {
    pm.response.to.have.status(201);
});

pm.test("Response has success message", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.message).to.eql("User registered successfully.");
});

pm.test("User object exists without password", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.user).to.have.property("id");
    pm.expect(jsonData.user).to.have.property("username");
    pm.expect(jsonData.user).to.not.have.property("password");
});
```

---

### ENDPOINT 2: POST /api/auth/login/

**Folder**: `02 - Authentication`

**Setup**:
```
Name: Login (Get JWT Tokens)
Method: POST
URL: {{base_url}}/api/auth/login/
```

**Headers**:
```
Content-Type: application/json
```

**Body** (raw JSON):
```json
{
    "username": "{{test_username}}",
    "password": "{{test_password}}"
}
```

**Expected Response**:
- Status: `200 OK`
- Body:
```json
{
    "access": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refresh": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**What to Check**:
- `access` field contains a long JWT string
- `refresh` field contains a long JWT string
- Both tokens start with `eyJ` (base64-encoded JWT)

**Post-Response Script** (Tests tab) - **CRITICAL - Saves tokens for all other requests**:
```javascript
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

pm.test("Response contains access token", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData).to.have.property("access");
    pm.expect(jsonData.access).to.be.a("string");
    // Save to environment variable for other requests
    pm.environment.set("access_token", jsonData.access);
});

pm.test("Response contains refresh token", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData).to.have.property("refresh");
    pm.expect(jsonData.refresh).to.be.a("string");
    pm.environment.set("refresh_token", jsonData.refresh);
});
```

---

### ENDPOINT 3: POST /api/documents/upload/

**Folder**: `03 - Document Management`

**Setup**:
```
Name: Upload Document
Method: POST
URL: {{base_url}}/api/documents/upload/
```

**Headers**:
```
Authorization: Bearer {{access_token}}
Content-Type: multipart/form-data
```

**Body** (form-data):
```
Key: file
Type: File
Value: [Select a PDF, TXT, MD, CSV, JSON, HTML, XML, DOCX, or DOC file from your computer]
```

> **Important**: In the Body tab, select "form-data", then:
> 1. In the Key column, type `file`
> 2. Hover over the Key field - a dropdown appears on the right
> 3. Change from "Text" to "File"
> 4. Click the "Select Files" button that appears in the Value column
> 5. Choose your test file

**Allowed file types**: `.pdf`, `.txt`, `.md`, `.docx`, `.doc`, `.csv`, `.json`, `.html`, `.xml`
**Max file size**: 10 MB

**Expected Response**:
- Status: `202 Accepted`
- Body:
```json
{
    "message": "File upload accepted. Ingestion running in background.",
    "document": {
        "id": 1,
        "user": {
            "id": 1,
            "username": "testuser_01",
            "email": "testuser01@example.com"
        },
        "name": "test-document.pdf",
        "file_url": "http://localhost:8000/media/documents/test-document.pdf",
        "status": "PENDING",
        "entity_count": 0,
        "relationship_count": 0,
        "error_message": null,
        "processing_progress": 0,
        "processing_step": null,
        "created_at": "2026-07-09T10:00:00Z",
        "updated_at": "2026-07-09T10:00:00Z"
    }
}
```

**What to Check**:
- Status is `202 Accepted` (not 200 - this is async!)
- `document.status` is `"PENDING"` initially
- `document.id` is returned (save this for later requests)
- No `password` or sensitive info leaked

**Post-Response Script** (Tests tab):
```javascript
pm.test("Status code is 202", function () {
    pm.response.to.have.status(202);
});

pm.test("Upload accepted for background processing", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.message).to.include("accepted");
});

pm.test("Document ID is returned", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.document).to.have.property("id");
    // Save document ID for other requests
    pm.environment.set("uploaded_doc_id", jsonData.document.id);
});

pm.test("Document status is PENDING", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.document.status).to.eql("PENDING");
});
```

---

### ENDPOINT 4: GET /api/documents/

**Folder**: `03 - Document Management`

**Setup**:
```
Name: List Documents
Method: GET
URL: {{base_url}}/api/documents/
```

**Headers**:
```
Authorization: Bearer {{access_token}}
```

**Body**: None (GET request)

**Expected Response**:
- Status: `200 OK`
- Body:
```json
[
    {
        "id": 1,
        "user": {
            "id": 1,
            "username": "testuser_01",
            "email": "testuser01@example.com"
        },
        "name": "test-document.pdf",
        "file_url": "http://localhost:8000/media/documents/test-document.pdf",
        "status": "COMPLETED",
        "entity_count": 42,
        "relationship_count": 18,
        "error_message": null,
        "processing_progress": 100,
        "processing_step": "completed",
        "created_at": "2026-07-09T10:00:00Z",
        "updated_at": "2026-07-09T10:05:00Z"
    }
]
```

**What to Check**:
- Response is an array (even if empty: `[]`)
- Each document has `id`, `name`, `status`, `file_url`
- `user` object matches logged-in user
- No other user's documents are visible (multi-tenancy)

**Post-Response Script** (Tests tab):
```javascript
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

pm.test("Response is an array", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData).to.be.an("array");
});

pm.test("Documents belong to current user only", function () {
    var jsonData = pm.response.json();
    jsonData.forEach(function(doc) {
        pm.expect(doc.user.username).to.eql(pm.environment.get("test_username"));
    });
});
```

---

### ENDPOINT 5: GET /api/documents/{id}/

**Folder**: `03 - Document Management`

**Setup**:
```
Name: Get Document Detail
Method: GET
URL: {{base_url}}/api/documents/{{uploaded_doc_id}}/
```

**Headers**:
```
Authorization: Bearer {{access_token}}
```

**Body**: None

**Expected Response**:
- Status: `200 OK`
- Body: Single document object (same structure as list item)

**What to Check**:
- Returned document `id` matches `{{uploaded_doc_id}}`
- All fields are present and populated
- `file_url` is a valid URL

**Post-Response Script** (Tests tab):
```javascript
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

pm.test("Returned document matches requested ID", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.id).to.eql(parseInt(pm.environment.get("uploaded_doc_id")));
});

pm.test("Document has all required fields", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData).to.have.all.keys(
        "id", "user", "name", "file_url", "status",
        "entity_count", "relationship_count", "error_message",
        "processing_progress", "processing_step",
        "created_at", "updated_at"
    );
});
```

---

### ENDPOINT 6: DELETE /api/documents/{id}/

**Folder**: `03 - Document Management`

**Setup**:
```
Name: Delete Document
Method: DELETE
URL: {{base_url}}/api/documents/{{uploaded_doc_id}}/
```

**Headers**:
```
Authorization: Bearer {{access_token}}
```

**Body**: None

**Expected Response**:
- Status: `200 OK`
- Body:
```json
{
    "message": "Document and all extracted nodes/vectors deleted successfully."
}
```

**What to Check**:
- Confirmation message is returned
- Document is actually removed (call List Documents to verify)

**Post-Response Script** (Tests tab):
```javascript
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

pm.test("Deletion confirmation message", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.message).to.include("deleted successfully");
});
```

---

### ENDPOINT 7: POST /api/query/

**Folder**: `04 - Query Endpoints`

**Setup**:
```
Name: Hybrid Query (Default)
Method: POST
URL: {{base_url}}/api/query/
```

**Headers**:
```
Authorization: Bearer {{access_token}}
Content-Type: application/json
```

**Body** (raw JSON):
```json
{
    "query": "What are the main topics discussed in the document?",
    "mode": "hybrid"
}
```

> `mode` can be: `"hybrid"` (default), `"graph"`, or `"vector"`

**Expected Response**:
- Status: `200 OK`
- Body:
```json
{
    "answer": "The document discusses several main topics including...",
    "sources": [
        {
            "content": "excerpt from document...",
            "metadata": {"page": 1, "source": "test-document.pdf"}
        }
    ],
    "strategy": "HYBRID",
    "success": true,
    "response_time": 2.345
}
```

**What to Check**:
- `answer` field contains a non-empty string
- `success` is `true`
- `strategy` matches the requested mode
- `sources` array contains relevant excerpts

**Post-Response Script** (Tests tab):
```javascript
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

pm.test("Query returned a valid answer", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.success).to.be.true;
    pm.expect(jsonData.answer).to.be.a("string");
    pm.expect(jsonData.answer.length).to.be.greaterThan(0);
});

pm.test("Response includes sources", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.sources).to.be.an("array");
});
```

---

### ENDPOINT 8: POST /api/query/graph-only/

**Folder**: `04 - Query Endpoints`

**Setup**:
```
Name: Graph-Only Query
Method: POST
URL: {{base_url}}/api/query/graph-only/
```

**Headers**:
```
Authorization: Bearer {{access_token}}
Content-Type: application/json
```

**Body** (raw JSON):
```json
{
    "query": "What entities are connected to the main concept?"
}
```

**Expected Response**:
- Status: `200 OK`
- Body: Similar to hybrid query but `strategy` will be `"GRAPH"`

**Post-Response Script** (Tests tab):
```javascript
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

pm.test("Graph-only strategy is used", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.strategy).to.eql("GRAPH");
});
```

---

### ENDPOINT 9: POST /api/query/vector-only/

**Folder**: `04 - Query Endpoints`

**Setup**:
```
Name: Vector-Only Query
Method: POST
URL: {{base_url}}/api/query/vector-only/
```

**Headers**:
```
Authorization: Bearer {{access_token}}
Content-Type: application/json
```

**Body** (raw JSON):
```json
{
    "query": "Find similar content about machine learning"
}
```

**Expected Response**:
- Status: `200 OK`
- Body: Similar structure but `strategy` will be `"VECTOR"`

**Post-Response Script** (Tests tab):
```javascript
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

pm.test("Vector-only strategy is used", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.strategy).to.eql("VECTOR");
});
```

---

### ENDPOINT 10: POST /api/query/compare/

**Folder**: `04 - Query Endpoints`

**Setup**:
```
Name: Compare All Query Modes
Method: POST
URL: {{base_url}}/api/query/compare/
```

**Headers**:
```
Authorization: Bearer {{access_token}}
Content-Type: application/json
```

**Body** (raw JSON):
```json
{
    "query": "Explain the relationships between key concepts"
}
```

**Expected Response**:
- Status: `200 OK`
- Body:
```json
{
    "query": "Explain the relationships between key concepts",
    "comparisons": {
        "graph": {
            "answer": "...",
            "sources": [],
            "strategy": "GRAPH",
            "response_time": 1.234,
            "success": true
        },
        "vector": {
            "answer": "...",
            "sources": [],
            "strategy": "VECTOR",
            "response_time": 0.987,
            "success": true
        },
        "hybrid": {
            "answer": "...",
            "sources": [],
            "strategy": "HYBRID",
            "response_time": 1.567,
            "success": true
        }
    },
    "success": true
}
```

**What to Check**:
- All 3 modes (`graph`, `vector`, `hybrid`) are present in `comparisons`
- Each has `answer`, `sources`, `strategy`, `response_time`, `success`
- `success` is `true` for the overall response

**Post-Response Script** (Tests tab):
```javascript
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

pm.test("All three modes are compared", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.comparisons).to.have.all.keys("graph", "vector", "hybrid");
});

pm.test("Each mode has required fields", function () {
    var jsonData = pm.response.json();
    ["graph", "vector", "hybrid"].forEach(function(mode) {
        pm.expect(jsonData.comparisons[mode]).to.have.all.keys(
            "answer", "sources", "strategy", "response_time", "success"
        );
    });
});
```

---

### ENDPOINT 11: GET /api/graph/

**Folder**: `05 - Graph Endpoints`

**Setup**:
```
Name: Get Full Graph Data
Method: GET
URL: {{base_url}}/api/graph/
```

**Headers**:
```
Authorization: Bearer {{access_token}}
```

**Body**: None

**Expected Response**:
- Status: `200 OK`
- Body:
```json
{
    "nodes": [
        {
            "id": "entity_1",
            "label": "Machine Learning",
            "type": "CONCEPT",
            "properties": {}
        }
    ],
    "edges": [
        {
            "source": "entity_1",
            "target": "entity_2",
            "relationship": "RELATED_TO",
            "properties": {}
        }
    ]
}
```

**What to Check**:
- `nodes` is an array
- `edges` is an array
- Each node has `id`, `label`, `type`
- Each edge has `source`, `target`, `relationship`

**Post-Response Script** (Tests tab):
```javascript
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

pm.test("Response contains nodes and edges", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData).to.have.property("nodes");
    pm.expect(jsonData).to.have.property("edges");
    pm.expect(jsonData.nodes).to.be.an("array");
    pm.expect(jsonData.edges).to.be.an("array");
});
```

---

### ENDPOINT 12: GET /api/graph/entity/{name}/

**Folder**: `05 - Graph Endpoints`

**Setup**:
```
Name: Get Entity Details
Method: GET
URL: {{base_url}}/api/graph/entity/Machine Learning/
```

> Replace `Machine Learning` with an actual entity name from your graph.

**Headers**:
```
Authorization: Bearer {{access_token}}
```

**Body**: None

**Expected Response**:
- Status: `200 OK`
- Body:
```json
{
    "name": "Machine Learning",
    "type": "CONCEPT",
    "properties": {},
    "relationships": [
        {
            "target": "Deep Learning",
            "type": "SUBSET_OF"
        }
    ],
    "subgraph": {
        "nodes": [],
        "edges": []
    }
}
```

**What to Check**:
- Entity `name` matches the requested name
- `relationships` array shows connections
- `subgraph` contains the local neighborhood

**Post-Response Script** (Tests tab):
```javascript
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

pm.test("Entity name matches request", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.name).to.eql("Machine Learning");
});
```

---

### ENDPOINT 13: GET /api/graph/path/

**Folder**: `05 - Graph Endpoints`

**Setup**:
```
Name: Find Path Between Entities
Method: GET
URL: {{base_url}}/api/graph/path/?entity_a=Entity1&entity_b=Entity2
```

> Replace `Entity1` and `Entity2` with actual entity names.

**Headers**:
```
Authorization: Bearer {{access_token}}
```

**Body**: None (query parameters in URL)

**Query Parameters** (can also set in "Params" tab):

| Key        | Value     |
|------------|-----------|
| `entity_a` | `Entity1` |
| `entity_b` | `Entity2` |

**Expected Response**:
- Status: `200 OK`
- Body:
```json
{
    "entity_a": "Entity1",
    "entity_b": "Entity2",
    "path": ["Entity1", "Intermediate", "Entity2"],
    "explanation": "Entity1 is connected to Entity2 through...",
    "path_length": 2,
    "success": true
}
```

**Post-Response Script** (Tests tab):
```javascript
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

pm.test("Path response has required fields", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData).to.have.property("path");
    pm.expect(jsonData.path).to.be.an("array");
    pm.expect(jsonData.path.length).to.be.greaterThan(0);
});
```

---

### ENDPOINT 14: POST /api/graph/cypher/

**Folder**: `05 - Graph Endpoints`

**Setup**:
```
Name: Execute Cypher Query
Method: POST
URL: {{base_url}}/api/graph/cypher/
```

**Headers**:
```
Authorization: Bearer {{access_token}}
Content-Type: application/json
```

**Body** (raw JSON):
```json
{
    "query": "MATCH (n) RETURN labels(n) AS label, count(n) AS count ORDER BY count DESC LIMIT 10"
}
```

> This translates natural language or raw Cypher and executes it.

**Expected Response**:
- Status: `200 OK`
- Body:
```json
{
    "cypher": "MATCH (n) RETURN labels(n) AS label, count(n) AS count ORDER BY count DESC LIMIT 10",
    "results": [
        {"label": ["CONCEPT"], "count": 42},
        {"label": ["PERSON"], "count": 15}
    ],
    "success": true
}
```

**Post-Response Script** (Tests tab):
```javascript
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

pm.test("Cypher query executed successfully", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.success).to.be.true;
    pm.expect(jsonData.results).to.be.an("array");
});
```

---

### ENDPOINT 15: GET /api/graph/stats/

**Folder**: `05 - Graph Endpoints`

**Setup**:
```
Name: Get Graph Statistics
Method: GET
URL: {{base_url}}/api/graph/stats/
```

**Headers**:
```
Authorization: Bearer {{access_token}}
```

**Body**: None

**Expected Response**:
- Status: `200 OK`
- Body:
```json
{
    "total_nodes": 150,
    "total_edges": 320,
    "node_types": {
        "CONCEPT": 42,
        "PERSON": 15,
        "ORGANIZATION": 8,
        "DOCUMENT": 5
    },
    "edge_types": {
        "RELATED_TO": 120,
        "AUTHORED_BY": 30,
        "PART_OF": 45
    }
}
```

**Post-Response Script** (Tests tab):
```javascript
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

pm.test("Stats contain node and edge counts", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData).to.have.property("total_nodes");
    pm.expect(jsonData).to.have.property("total_edges");
    pm.expect(jsonData.total_nodes).to.be.a("number");
    pm.expect(jsonData.total_edges).to.be.a("number");
});
```

---

### ENDPOINT 16: GET /api/graph/communities/

**Folder**: `05 - Graph Endpoints`

**Setup**:
```
Name: List Communities
Method: GET
URL: {{base_url}}/api/graph/communities/
```

**Headers**:
```
Authorization: Bearer {{access_token}}
```

**Body**: None

**Expected Response**:
- Status: `200 OK`
- Body:
```json
{
    "communities": [
        {
            "id": 1,
            "label": "Community 1",
            "summary": "This community covers...",
            "member_count": 12,
            "members": ["Entity1", "Entity2", "Entity3"]
        }
    ],
    "count": 1
}
```

**Post-Response Script** (Tests tab):
```javascript
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

pm.test("Communities response structure", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData).to.have.property("communities");
    pm.expect(jsonData).to.have.property("count");
    pm.expect(jsonData.communities).to.be.an("array");
});
```

---

### ENDPOINT 17: GET /api/graph/communities/{id}/

**Folder**: `05 - Graph Endpoints`

**Setup**:
```
Name: Get Community Detail
Method: GET
URL: {{base_url}}/api/graph/communities/1/
```

> Replace `1` with an actual community ID from the list endpoint.

**Headers**:
```
Authorization: Bearer {{access_token}}
```

**Body**: None

**Expected Response**:
- Status: `200 OK`
- Body:
```json
{
    "id": 1,
    "label": "Community 1",
    "summary": "This community covers...",
    "member_count": 12,
    "members": ["Entity1", "Entity2"],
    "member_details": [
        {
            "name": "Entity1",
            "type": "CONCEPT",
            "properties": {}
        }
    ]
}
```

**Post-Response Script** (Tests tab):
```javascript
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

pm.test("Community ID matches request", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.id).to.eql(1);
});
```

---

### ENDPOINT 18: POST /api/graph/search/

**Folder**: `05 - Graph Endpoints`

**Setup**:
```
Name: Search Entities
Method: POST
URL: {{base_url}}/api/graph/search/
```

**Headers**:
```
Authorization: Bearer {{access_token}}
Content-Type: application/json
```

**Body** (raw JSON):
```json
{
    "query": "machine learning"
}
```

**Expected Response**:
- Status: `200 OK`
- Body:
```json
{
    "query": "machine learning",
    "results": [
        {
            "name": "Machine Learning",
            "type": "CONCEPT",
            "properties": {"description": "..."}
        },
        {
            "name": "Deep Learning",
            "type": "CONCEPT",
            "properties": {"description": "..."}
        }
    ],
    "count": 2
}
```

**Post-Response Script** (Tests tab):
```javascript
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

pm.test("Search returns results array", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData).to.have.property("results");
    pm.expect(jsonData.results).to.be.an("array");
    pm.expect(jsonData).to.have.property("count");
});
```

---

### ENDPOINT 19: GET /api/evaluation/

**Folder**: `06 - Evaluation`

**Setup**:
```
Name: Run Evaluation
Method: GET
URL: {{base_url}}/api/evaluation/
```

**Headers**:
```
Authorization: Bearer {{access_token}}
```

**Body**: None

**Expected Response**:
- Status: `200 OK`
- Body:
```json
{
    "evaluations": [
        {
            "question": "What is X?",
            "expected_answer": "X is...",
            "results": {
                "graph": {
                    "answer": "...",
                    "response_time": 1.234,
                    "success": true
                },
                "vector": {
                    "answer": "...",
                    "response_time": 0.987,
                    "success": true
                },
                "hybrid": {
                    "answer": "...",
                    "response_time": 1.567,
                    "success": true
                }
            }
        }
    ],
    "summary": {
        "total_pairs": 1,
        "avg_response_times": {
            "graph": 1.234,
            "vector": 0.987,
            "hybrid": 1.567
        }
    }
}
```

**Post-Response Script** (Tests tab):
```javascript
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

pm.test("Evaluation has correct structure", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData).to.have.property("evaluations");
    pm.expect(jsonData).to.have.property("summary");
    pm.expect(jsonData.evaluations).to.be.an("array");
});
```

---

### ENDPOINT 20: GET /api/health/

**Folder**: `01 - Health Check`

**Setup**:
```
Name: Health Check
Method: GET
URL: {{base_url}}/api/health/
```

**Headers**: None needed (no auth required)

**Body**: None

**Expected Response**:
- Status: `200 OK`
- Body:
```json
{
    "status": "healthy",
    "services": {
        "django": "healthy",
        "neo4j": "healthy",
        "timestamp": 1688888000.0
    }
}
```

**What to Check**:
- `status` is `"healthy"` or `"degraded"`
- `services.django` is `"healthy"`
- `services.neo4j` is `"healthy"` (if Neo4j is running)

**Post-Response Script** (Tests tab):
```javascript
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

pm.test("Django service is healthy", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.services.django).to.eql("healthy");
});

pm.test("Health status is valid", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.status).to.be.oneOf(["healthy", "degraded"]);
});
```

---

## 5. Chaining Requests with JWT Tokens

### How Token Chaining Works

The key mechanism is the **Post-Response Script** in the Login request that saves tokens to environment variables:

```
Login Request
    ↓ (Post-Response Script saves tokens)
    pm.environment.set("access_token", jsonData.access);
    pm.environment.set("refresh_token", jsonData.refresh);
    ↓
All other requests use: Authorization: Bearer {{access_token}}
```

### Complete Chaining Flow

```
Step 1: Health Check (no auth needed)
    ↓
Step 2: Register User (no auth needed)
    ↓
Step 3: Login -> saves access_token & refresh_token to environment
    ↓
Step 4-19: All other requests use {{access_token}} in Authorization header
    ↓
Step 20 (optional): Refresh Token -> saves new access_token
```

### Refreshing an Expired Token

When your access token expires (after 30 minutes), create a new request:

**Setup**:
```
Name: Refresh Token
Method: POST
URL: {{base_url}}/api/auth/token/refresh/
```

**Headers**:
```
Content-Type: application/json
```

**Body** (raw JSON):
```json
{
    "refresh": "{{refresh_token}}"
}
```

**Post-Response Script** (Tests tab):
```javascript
pm.test("Token refreshed successfully", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData).to.have.property("access");
    pm.environment.set("access_token", jsonData.access);
    // If refresh token is also rotated
    if (jsonData.refresh) {
        pm.environment.set("refresh_token", jsonData.refresh);
    }
});
```

---

## 6. Writing Post-Response Tests

### Test Syntax Reference

```javascript
// Status code tests
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

// Response time tests
pm.test("Response time is under 2 seconds", function () {
    pm.expect(pm.response.responseTime).to.be.below(2000);
});

// Header tests
pm.test("Content-Type is JSON", function () {
    pm.response.to.have.header("Content-Type", "application/json");
});

// Body field existence
pm.test("Response has 'answer' field", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData).to.have.property("answer");
});

// Body field value
pm.test("Answer is not empty", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.answer.length).to.be.greaterThan(0);
});

// Array tests
pm.test("Results is an array with items", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.results).to.be.an("array");
    pm.expect(jsonData.results.length).to.be.greaterThan(0);
});

// Type checks
pm.test("ID is a number", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.id).to.be.a("number");
});

// Nested object checks
pm.test("User object has username", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.user.username).to.be.a("string");
});

// Conditional tests
pm.test("If success is true, answer exists", function () {
    var jsonData = pm.response.json();
    if (jsonData.success) {
        pm.expect(jsonData.answer).to.exist;
    }
});

// Environment variable assertions
pm.test("Token was saved", function () {
    pm.expect(pm.environment.get("access_token")).to.exist;
    pm.expect(pm.environment.get("access_token").length).to.be.greaterThan(10);
});

// Chai assertions (more expressive)
pm.test("Response matches expected schema", function () {
    var schema = {
        type: "object",
        required: ["answer", "sources", "success"],
        properties: {
            answer: { type: "string" },
            sources: { type: "array" },
            success: { type: "boolean" }
        }
    };
    var jsonData = pm.response.json();
    pm.expect(tv4.validate(jsonData, schema)).to.be.true;
});
```

### Setting Variables in Tests

```javascript
// Set environment variable
pm.environment.set("variable_name", value);

// Set collection variable (shared across environments)
pm.collectionVariables.set("variable_name", value);

// Set global variable
pm.globals.set("variable_name", value);

// Get a variable
var val = pm.environment.get("variable_name");

// Clear a variable
pm.environment.unset("variable_name");
```

---

## 7. Common Errors & Troubleshooting

### Error 1: `401 Unauthorized`

```
Cause: Missing or invalid JWT token
Fix:
  1. Ensure you ran the Login request first
  2. Check that access_token environment variable is set
  3. Verify the Authorization header format: "Bearer {{access_token}}"
  4. Token may have expired (30 min lifetime) - run Refresh Token request
```

### Error 2: `400 Bad Request - "Passwords do not match"`

```
Cause: password and confirm_password fields differ
Fix:
  1. Ensure both fields have identical values
  2. Check for trailing spaces in either field
  3. Password must contain: uppercase, lowercase, number, special char (@$!%*?&)
```

### Error 3: `400 Bad Request - "Disposable or temporary email accounts are not permitted"`

```
Cause: Email domain is in the blocklist
Fix: Use a legitimate email domain like:
  - @gmail.com
  - @outlook.com
  - @company.com
  Do NOT use: mailinator.com, yopmail.com, tempmail.com, etc.
```

### Error 4: `400 Bad Request - "No file was uploaded"`

```
Cause: Missing file in multipart form-data
Fix:
  1. Body type must be "form-data" (not raw JSON)
  2. Key must be exactly "file"
  3. Change key type from "Text" to "File" (hover over key field)
  4. Select a valid file using the file picker
```

### Error 5: `413 Request Entity Too Large`

```
Cause: File exceeds 10 MB limit
Fix: Compress or split your file to under 10 MB
```

### Error 6: `400 Bad Request - "File type '.exe' is not allowed"`

```
Cause: Uploaded file extension not in allowed list
Allowed: .pdf, .txt, .md, .docx, .doc, .csv, .json, .html, .xml
Fix: Convert file to an allowed format
```

### Error 7: `404 Not Found - "Entity 'X' not found"`

```
Cause: Requested entity name doesn't exist in the graph
Fix:
  1. First call GET /api/graph/ to see available entities
  2. Or call POST /api/graph/search/ to find entity names
  3. Entity names are case-sensitive
```

### Error 8: `429 Too Many Requests`

```
Cause: Rate limit exceeded (100 requests/minute for authenticated users)
Fix:
  1. Wait 60 seconds before retrying
  2. Reduce request frequency
  3. In Postman Runner, add a delay between iterations
```

### Error 9: `500 Internal Server Error`

```
Cause: Server-side error (Neo4j down, LLM API key missing, etc.)
Fix:
  1. Check Django server logs
  2. Verify Neo4j is running: GET /api/health/
  3. Check LLM API key is configured in .env
  4. Ensure ChromaDB is initialized
```

### Error 10: `Connection Refused`

```
Cause: Django server not running
Fix:
  cd backend
  python manage.py runserver
  # Should see: Starting development server at http://localhost:8000/
```

---

## 8. Using Postman Runner for Batch Testing

### Step 8.1: Set Up a Test Suite Order

Create a file called `test-order.json` or manually arrange requests in this order:

```
Test Execution Order:
1. GET  /api/health/                    (verify server is up)
2. POST /api/auth/register/             (create test user)
3. POST /api/auth/login/                (get JWT tokens)
4. POST /api/documents/upload/          (upload test document)
5. GET  /api/documents/                 (list documents)
6. GET  /api/documents/{id}/            (get document detail)
7. POST /api/query/                     (hybrid query)
8. POST /api/query/graph-only/          (graph query)
9. POST /api/query/vector-only/         (vector query)
10. POST /api/query/compare/            (compare all modes)
11. GET  /api/graph/                    (full graph)
12. GET  /api/graph/entity/{name}/      (entity detail)
13. GET  /api/graph/path/               (find path)
14. POST /api/graph/cypher/             (execute cypher)
15. GET  /api/graph/stats/              (graph stats)
16. GET  /api/graph/communities/        (list communities)
17. GET  /api/graph/communities/{id}/   (community detail)
18. POST /api/graph/search/             (search entities)
19. GET  /api/evaluation/               (run evaluation)
20. DELETE /api/documents/{id}/         (cleanup - delete document)
```

### Step 8.2: Open Postman Runner

```
1. Click "Runner" button in the top toolbar (or press Ctrl+Shift+R)
2. A new tab opens with the Collection Runner interface
```

### Step 8.3: Configure the Runner

```
1. Select Collection: "GraphRAG Knowledge Graph AI API"
2. Select Environment: "GraphRAG Local Dev"
3.Iterations: Set number of times to run (e.g., 5 for stress testing)
4. Delay: Set delay between requests in ms (e.g., 500ms)
5. Data File: (Optional) Upload a CSV/JSON with test data
6. Save responses: Toggle ON to save all responses
7. Keep variable values: Select "Save to Environment"
```

### Step 8.4: Data-Driven Testing with CSV

Create a file called `test-queries.csv`:
```csv
query,mode,expected_strategy
What is machine learning?,hybrid,HYBRID
Explain neural networks,graph,GRAPH
Find similar research papers,vector,VECTOR
Compare all approaches for NLP,hybrid,HYBRID
```

In Runner:
```
1. Click "Select File" next to "Data"
2. Upload test-queries.csv
3. In your requests, use: {{query}}, {{mode}}, {{expected_strategy}}
4. Postman will iterate through each row
```

### Step 8.5: Run and Analyze Results

```
1. Click "Run GraphRAG Knowledge Graph AI API"
2. Watch the execution in real-time
3. After completion, you'll see:
   - Total tests passed/failed
   - Response times for each request
   - Assertion results
   - Any errors encountered
```

### Step 8.6: Export Results

```
1. After run completes, click "Export Results"
2. Save as JSON for further analysis
3. Or use "Download as JSON" for CI/CD integration
```

### Step 8.7: Newman (Command Line Runner)

For CI/CD pipelines, use Newman:

```bash
# Install Newman
npm install -g newman

# Export collection from Postman
# (In Postman: Collection -> ... -> Export -> Collection v2.1)

# Run collection
newman run "GraphRAG_Knowledge_Graph_AI_API.postman_collection.json" \
  --environment "GraphRAG_Local_Dev.postman_environment.json" \
  --iteration-count 5 \
  --delay-request 500 \
  --reporters cli,html

# Run with data file
newman run "GraphRAG_Knowledge_Graph_AI_API.postman_collection.json" \
  --environment "GraphRAG_Local_Dev.postman_environment.json" \
  --iteration-data "test-queries.csv" \
  --reporters cli,html
```

---

## Quick Reference Card

### Authentication Headers

```
All authenticated requests need:
Authorization: Bearer {{access_token}}

Content-Type: application/json       (for JSON bodies)
Content-Type: multipart/form-data    (for file uploads - set in body tab, not header)
```

### Request Body Formats

```
JSON Body:
{
    "key": "value"
}

Form-Data Body (for file uploads):
Key: file | Type: File | Value: [select file]

Query Parameters:
?entity_a=X&entity_b=Y
```

### Expected Status Codes

| Code | Meaning                          | When                                |
|------|----------------------------------|-------------------------------------|
| 200  | OK                               | Successful GET/DELETE               |
| 201  | Created                          | Successful POST (register)          |
| 202  | Accepted                         | Upload accepted (async processing)  |
| 400  | Bad Request                      | Invalid input / validation error    |
| 401  | Unauthorized                     | Missing/invalid/expired JWT token   |
| 404  | Not Found                        | Entity/document doesn't exist       |
| 413  | Request Entity Too Large         | File exceeds 10MB limit             |
| 429  | Too Many Requests                | Rate limit exceeded                 |
| 500  | Internal Server Error            | Server-side failure                 |

### Password Requirements

```
Must contain:
  - At least 1 uppercase letter (A-Z)
  - At least 1 lowercase letter (a-z)
  - At least 1 number (0-9)
  - At least 1 special character (@$!%*?&)
  - Minimum 8 characters
  - Must match confirm_password field
```

---

**Guide Version**: 1.0
**API Base URL**: http://localhost:8000
**Total Endpoints Documented**: 20
**Authentication**: JWT (SimpleJWT - 30min access, 7-day refresh)
