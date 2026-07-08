**Assignment \#10** 

**GraphRAG &** 

**Knowledge Graph AI** 

Build a Knowledge Graph-Powered Retrieval System with Neo4j, Entity Extraction, Graph Traversal & Hybrid Graph+Vector Search 

**Organization:** Excellence Technologies Pvt Ltd 

**Phase:** Phase 2 \- LangChain & Advanced RAG 

**Backend:** Django (Python) 

**Frontend:** Next.js (React) 

**Duration:** 4 Days 

**Difficulty:** Advanced 

**Graph AI Capabilities** 

Neo4j Graph Database | Automated Entity & Relationship Extraction | Cypher Queries Graph Traversal Retrieval | Hybrid Graph+Vector Search | Community Detection Interactive Graph Visualization | Multi-Hop Reasoning | Graph-Grounded Q\&A 

This is an advanced assignment requiring Neo4j. Read all sections carefully.  
Assignment \#10: GraphRAG & Knowledge Graph AI | Excellence Technologies Page 2 

 **1\. Assignment Overview** 

In this assignment, you will build a GraphRAG & Knowledge Graph AI platform \- a system that goes beyond traditional vector-based RAG by constructing a knowledge graph from your documents and using graph traversal, community detection, and structured relationships as a retrieval mechanism alongside (or instead of) vector similarity search. 

Traditional RAG retrieves text chunks that are semantically similar to a query. GraphRAG retrieves structured knowledge: entities, relationships, and communities of related concepts. This makes it dramatically better at multi-hop reasoning ('Who manages the person who leads Project X?'), relationship queries ('What companies are partners with Acme?'), and holistic summarization ('Give me an overview of the entire organizational structure'). 

**What You Will Demonstrate** 

\- Setting up and working with Neo4j graph database (Cypher query language, nodes, relationships, properties) \- Automated entity extraction: using LLMs to extract entities and relationships from unstructured text \- Building a knowledge graph pipeline: document \-\> entity extraction \-\> relationship extraction \-\> graph construction 

\- Graph-based retrieval: traversing the graph to find context for user queries (vs. vector similarity) \- Hybrid graph \+ vector retrieval: combining structured graph knowledge with unstructured text chunks \- Multi-hop reasoning: answering questions that require following chains of relationships across the graph \- Community detection: identifying clusters of related entities for thematic summarization 

\- Interactive graph visualization with real-time exploration and query-driven highlighting 

\- Building a Django backend with Neo4j integration and a polished Next.js frontend 

**Why GraphRAG?** 

Vector RAG: 'Find chunks similar to my query.' GraphRAG: 'Find all entities related to X, follow their connections to Y, gather context from the entire subgraph, then answer.' Vector RAG retrieves text. GraphRAG retrieves understanding. For documents with rich entity relationships (org charts, research papers, legal contracts, technical manuals), GraphRAG dramatically outperforms vector-only retrieval. 

 **2\. Problem Statement** 

Build a GraphRAG Platform where users can: 

**1\.** Upload documents and automatically construct a knowledge graph: extract entities (people, organizations, concepts, events, locations) and relationships (works\_at, manages, part\_of, depends\_on, etc.) **2\.** Visualize the entire knowledge graph as an interactive, explorable network diagram 

**3\.** Query the knowledge graph using natural language: 'Who reports to the CTO?', 'What projects depend on the authentication service?', 'Show me all partnerships mentioned in the document' 

**4\.** Perform hybrid retrieval: combine graph traversal context with vector-retrieved text chunks for comprehensive answers 

**5\.** Handle multi-hop questions that require following chains of relationships: 'What skills does the manager of Confidential \- For Internal Use Only  
Assignment \#10: GraphRAG & Knowledge Graph AI | Excellence Technologies Page 3 

the team that built the payment system have?' 

**6\.** Generate graph-grounded summaries: summarize entire documents or topics using the knowledge graph structure as a skeleton 

**7\.** Detect communities/clusters in the graph and provide thematic summaries per community **8\.** Compare GraphRAG vs. Vector RAG: run the same queries through both and demonstrate where graph retrieval excels 

**Example Use Cases** 

\- **Company Research:** Upload a company's annual report. GraphRAG builds: executives \-\> departments \-\> products \-\> markets \-\> competitors. User asks: 'Which department is responsible for 

the fastest-growing product?' \- requires traversing 

person-\>department-\>product-\>revenue relationships. 

\- **Technical Documentation:** Upload API documentation. GraphRAG builds: services \-\> endpoints \-\> dependencies \-\> data models. User asks: 'If I change the User model, which 

endpoints will be affected?' \- multi-hop dependency traversal. 

\- **Legal Contracts:** Upload a set of contracts. GraphRAG builds: parties \-\> obligations \-\> conditions \-\> dates \-\> penalties. User asks: 'What are all of Company A's obligations across all contracts?' \- entity-centric aggregation. 

\- **Research Papers:** Upload multiple research papers. GraphRAG builds: authors \-\> institutions \-\> methods \-\> findings \-\> citations. User asks: 'What methods have researchers from MIT used for text classification?' \- multi-entity intersection query. 

Confidential \- For Internal Use Only  
Assignment \#10: GraphRAG & Knowledge Graph AI | Excellence Technologies Page 4 

 **3\. Technical Requirements** 

**3.1 Knowledge Graph Construction Pipeline** 

Build an automated pipeline that transforms documents into a knowledge graph: 

\- **Document Processing:** Load documents (PDF, TXT, DOCX, Markdown). Split into paragraphs or logical sections (not small token chunks \- entities span sentences). Each section maintains 

source metadata (document name, page, section header). 

\- **Entity Extraction:** Use the LLM to extract entities from each section. Prompt the LLM to identify: Person, Organization, Product, Technology, Location, Event, Date, Concept, Document. Each entity has: name (canonical form), type, description (1-2 sentences), and source section. 

\- **Relationship Extraction:** Use the LLM to extract relationships between entities found in the same or adjacent sections. Each relationship has: source entity, relationship type, target entity, 

description, confidence score, and source section. Relationship types: works\_at, 

manages, part\_of, depends\_on, created\_by, located\_in, related\_to, competes\_with, 

partner\_of, succeeded\_by, etc. 

\- **Entity Resolution:** Resolve duplicate entities: 'John Smith', 'J. Smith', and 'John' in the same document likely refer to the same person. Use LLM \+ string similarity to merge duplicates and create 

canonical entity names. 

\- **Graph Construction:** Insert entities as nodes and relationships as edges into Neo4j. Attach all metadata as properties (source document, page, confidence, description). 

\- **Incremental Updates:** When a new document is uploaded, add its entities/relationships to the existing graph. Merge with existing entities (entity resolution across documents). Do not rebuild the 

entire graph. 

**3.2 Neo4j Integration** 

Set up and work with Neo4j as the graph database: 

\- **Neo4j Setup:** Use Neo4j Community Edition (free, open-source). Run via Docker (recommended) or local install. Connect from Django using the official neo4j Python driver or neomodel ORM. 

\- **Schema Design:** Nodes: Entity (with properties: name, type, description, source\_doc, page, created\_at). Relationships: dynamic types (WORKS\_AT, MANAGES, PART\_OF, etc.) with properties (description, confidence, source\_doc, page). 

\- **Cypher Queries:** Write Cypher queries for: find entity by name, get all relationships for an entity, find paths between two entities, get N-hop neighborhood, community detection, aggregate by entity type, full-text search on entity descriptions. 

\- **Indexes:** Create indexes on Entity.name, Entity.type, and full-text indexes on Entity.description for fast lookup. 

\- **Graph Statistics:** Query Neo4j for stats: total nodes, total relationships, entity type distribution, most connected entities (hub analysis), average path length. 

Confidential \- For Internal Use Only  
Assignment \#10: GraphRAG & Knowledge Graph AI | Excellence Technologies Page 5 

**3.3 Graph-Based Retrieval** 

Use the knowledge graph as a retrieval mechanism for Q\&A: 

\- **Entity-Centric Retrieval:** Given a query, first extract mentioned entities. Look up these entities in the graph. Retrieve their descriptions, relationships, and N-hop neighbors as context. This 

provides structured, relationship-aware context. 

\- **Subgraph Extraction:** For a query about entity X, extract the relevant subgraph: X \+ all directly connected entities \+ their mutual relationships. Serialize this subgraph as context text for the 

LLM. 

\- **Path-Based Retrieval:** For multi-hop questions ('Who manages the team that built X?'), find shortest paths between entities in the graph. The path itself becomes the answer context: A 

\--manages--\> B \--leads--\> Team \--built--\> X. 

\- **Natural Language to Cypher:** Convert user queries to Cypher queries using the LLM. E.g., 'Who works at Acme?' becomes MATCH (p:Entity)-\[:WORKS\_AT\]-\>(o:Entity {name: 'Acme'}) 

RETURN p. Execute the Cypher, return results as context. 

\- **Community-Based Retrieval:** For broad questions ('Tell me about the engineering division'), identify the relevant community/cluster of entities and summarize the entire subgraph. 

Confidential \- For Internal Use Only  
Assignment \#10: GraphRAG & Knowledge Graph AI | Excellence Technologies Page 6 

**3.4 Hybrid Graph \+ Vector Retrieval** 

Combine graph and vector retrieval for comprehensive answers: 

\- **Dual Retrieval:** For every query, run both: (1) Graph retrieval (entity lookup \+ subgraph extraction), (2) Vector retrieval (standard semantic search on text chunks). Merge both contexts before sending to the LLM. 

\- **Context Assembly:** Structure the combined context as: 'GRAPH CONTEXT: \[structured entity and relationship information\] TEXT CONTEXT: \[relevant text passages from vector search\]'. 

The LLM gets both structured knowledge and verbatim text. 

\- **Retrieval Strategy Selection:** Auto-detect which retrieval is more useful: (1) If query mentions specific entities or asks about relationships \-\> weight graph retrieval higher. (2) If query 

is conceptual/thematic \-\> weight vector retrieval higher. (3) Default: use both 

equally. 

\- **Comparison Mode:** Allow users to compare: Graph-only answer vs. Vector-only answer vs. Hybrid answer for the same query. Show which approach produced the best result. 

**3.5 Community Detection & Summarization** 

Detect clusters of related entities and generate summaries: 

\- **Community Detection:** Use Neo4j's Graph Data Science (GDS) library or a Python algorithm (Louvain, Label Propagation) to detect communities in the graph. Each community is a cluster of 

closely connected entities. 

\- **Community Labeling:** Use the LLM to generate a descriptive label for each community based on its member entities and relationships. E.g., a community containing {CEO, CFO, Board Members, 

Revenue, Shareholders} might be labeled 'Corporate Governance & Finance'. 

\- **Community Summaries:** Generate a 2-3 paragraph summary of each community: what entities it contains, how they relate, and what themes they represent. These summaries serve as a 

high-level document overview. 

\- **Hierarchical Summarization:** Community summaries can be combined to create a document-level summary that follows the graph structure. This produces better summaries than 

text-based summarization for complex, multi-topic documents. 

**3.6 Multi-Hop Reasoning** 

Handle questions that require traversing multiple relationship hops: 

\- **Query Analysis:** Detect multi-hop questions. Signs: 'Who manages the person who...', 'What depends on the service that...', 'List all X connected to Y through Z'. The LLM classifies whether a query requires multi-hop reasoning. 

\- **Path Finding:** Use Neo4j's shortestPath or allShortestPaths Cypher functions to find paths between entities mentioned in the query. Support up to 5 hops. 

\- **Reasoning Chain:** Present the answer as a reasoning chain: 'John manages Alice (source: org chart). Alice leads Team X (source: project doc). Team X built the Payment Service (source: tech doc). 

Confidential \- For Internal Use Only  
Assignment \#10: GraphRAG & Knowledge Graph AI | Excellence Technologies Page 7 

Therefore, John indirectly manages the team that built the Payment Service.' 

\- **Intermediate Entities:** Show the intermediate entities in the reasoning chain. Highlight them in the graph visualization so users can follow the logic visually. 

**3.7 Interactive Graph Visualization** 

Build a rich, explorable graph visualization: 

\- **Force-Directed Layout:** Render the full knowledge graph using a force-directed layout (D3.js, vis.js, or react-force-graph). Nodes represent entities, edges represent relationships. 

\- **Visual Encoding:** Node color \= entity type (person=blue, org=green, product=orange, etc.). Node size \= number of connections (more connected \= larger). Edge thickness \= confidence score. Edge labels \= relationship type. 

\- **Interactive Exploration:** Click node: expand to show all connected nodes. Double-click: focus on this node's subgraph. Hover: show entity description tooltip. Right-click: 'Ask about this entity' 

(sends query to RAG). 

\- **Query Highlighting:** When a query is answered, highlight the entities and paths used in the answer on the graph. Dim non-relevant nodes. Users see exactly which part of the graph informed the 

answer. 

\- **Filtering & Search:** Filter nodes by entity type, source document, community. Search for specific entities. Toggle relationship types on/off. 

\- **Community View:** Toggle between full graph view and community view (clusters grouped together with boundaries). Click a community to expand its members. 

**3.8 Backend API (Django REST Framework)** 

 **Method Endpoint Description** 

 POST /api/documents/upload/ Upload & process document into graph 

 GET /api/documents/ List uploaded documents 

 DELETE /api/documents/{id}/ Delete document & its graph entities 

 POST /api/query/ Query with auto graph+vector retrieval 

 POST /api/query/graph-only/ Query using only graph retrieval 

 POST /api/query/vector-only/ Query using only vector retrieval 

 POST /api/query/compare/ Compare graph vs. vector vs. hybrid answers  GET /api/graph/ Get full graph data (nodes \+ edges) 

 GET /api/graph/entity/{name}/ Get entity details \+ subgraph 

 GET /api/graph/path/ Find paths between two entities 

 POST /api/graph/cypher/ Execute raw Cypher query (admin/debug)  GET /api/graph/stats/ Graph statistics (nodes, edges, types) 

Confidential \- For Internal Use Only  
Assignment \#10: GraphRAG & Knowledge Graph AI | Excellence Technologies Page 8 

 GET /api/graph/communities/ List detected communities with summaries  GET /api/graph/communities/{id}/ Get community members & summary 

 POST /api/graph/search/ Search entities by name or description 

 GET /api/evaluation/ Evaluation results (graph vs. vector) 

 GET /api/health/ Health check (Django \+ Neo4j) 

Confidential \- For Internal Use Only  
Assignment \#10: GraphRAG & Knowledge Graph AI | Excellence Technologies Page 9 

 **4\. Recommended Tech Stack** 

**Backend (Django)** 

\- **Framework:** Django 4.2+ with Django REST Framework 

\- **Graph Database:** Neo4j Community Edition (free, via Docker: docker run \-p 7474:7474 \-p 7687:7687 neo4j) \- **Neo4j Driver:** neo4j Python driver (official) or neomodel (Django-like ORM for Neo4j) 

\- **Vector Database:** ChromaDB or Qdrant (for vector retrieval component) 

\- **LLM:** Google Gemini (free tier) or OpenAI GPT (for entity extraction, NL-to-Cypher, Q\&A) \- **Embeddings:** sentence-transformers (all-MiniLM-L6-v2) 

\- **LangChain:** LangChain \+ LangChain Neo4j integration (GraphCypherQAChain, Neo4jGraph) \- **Entity Resolution:** rapidfuzz library for fuzzy string matching during entity deduplication \- **Community Detection:** Neo4j GDS plugin or python-louvain (community detection algorithm) \- **Database:** PostgreSQL or SQLite (for Django models \- documents, queries, evaluation) \- **NLP:** spaCy (optional, for named entity recognition pre-processing before LLM extraction) 

**Frontend (Next.js)** 

\- **Framework:** Next.js 14+ with TypeScript 

\- **Styling:** Tailwind CSS \+ shadcn/ui 

\- **Graph Visualization:** react-force-graph-2d/3d (recommended \- supports large graphs, WebGL) or vis-network/react (simpler API) 

\- **Charts:** Recharts for stats and evaluation comparisons 

\- **Markdown:** react-markdown for answer rendering 

\- **State:** Zustand 

\- **Search:** Command palette (cmdk) for entity search 

**Neo4j Setup Required** 

Neo4j must be running for this assignment. Easiest setup: docker run \--name neo4j \-p 7474:7474 \-p 7687:7687 \-e NEO4J\_AUTH=neo4j/password neo4j:latest. Access the Neo4j Browser at http://localhost:7474 to verify. Your README must include clear Neo4j setup instructions. Docker-compose with Neo4j service is strongly recommended. 

**LangChain Neo4j Integration** 

LangChain has built-in Neo4j support: Neo4jGraph (connects to Neo4j, introspects schema), GraphCypherQAChain (converts natural language to Cypher and answers). Use these as a starting point but extend with custom retrieval logic for hybrid graph+vector search and multi-hop reasoning. 

 **5\. Expected Project Structure** 

`graphrag-knowledge-ai/` 

`|` 

`|-- backend/` 

Confidential \- For Internal Use Only  
Assignment \#10: GraphRAG & Knowledge Graph AI | Excellence Technologies Page 10 

`| |-- manage.py` 

`| |-- config/` 

`| | |-- settings.py # Django settings + Neo4j config` 

`| | |-- urls.py` 

`| |-- graphrag/ # Main Django app` 

`| | |-- models.py # Django models (documents, queries)` 

`| | |-- serializers.py # DRF serializers` 

`| | |-- views.py # API ViewSets` 

`| | |-- urls.py # URL routes` 

`| | |-- admin.py # Admin registration` 

`| | |-- services/` 

`| | | |-- entity_extractor.py # LLM entity extraction` 

`| | | |-- relationship_extractor.py # LLM relationship extraction` 

`| | | |-- entity_resolver.py # Deduplication & merging` 

`| | | |-- graph_builder.py # Neo4j graph construction` 

`| | | |-- graph_retriever.py # Graph-based retrieval` 

`| | | |-- vector_retriever.py # Vector similarity retrieval` 

`| | | |-- hybrid_retriever.py # Combined graph + vector` 

`| | | |-- nl_to_cypher.py # Natural language to Cypher` 

`| | | |-- community_detector.py # Community detection & labeling` 

`| | | |-- multihop_reasoner.py # Multi-hop path finding` 

`| | | |-- rag_chain.py # LangChain RAG pipeline` 

`| | | |-- neo4j_client.py # Neo4j connection & queries` 

`| |-- requirements.txt` 

`| |-- Dockerfile` 

`|` 

`|-- frontend/` 

`| |-- src/` 

`| | |-- app/` 

`| | | |-- page.tsx # Main query + graph page` 

`| | | |-- documents/page.tsx # Document management` 

`| | | |-- explore/page.tsx # Graph exploration` 

`| | | |-- compare/page.tsx # Retrieval comparison` 

`| | | |-- communities/page.tsx # Community view` 

`| | |-- components/` 

`| | | |-- GraphVisualization.tsx # Interactive graph (react-force-graph)` 

`| | | |-- QueryPanel.tsx # Natural language query input` 

`| | | |-- AnswerCard.tsx # Answer with graph highlighting` 

`| | | |-- EntityPanel.tsx # Entity details sidebar` 

`| | | |-- PathView.tsx # Multi-hop reasoning path` 

`| | | |-- CommunityView.tsx # Community clusters + summaries` 

`| | | |-- ComparisonView.tsx # Graph vs. Vector vs. Hybrid` 

`| | | |-- GraphStats.tsx # Graph statistics dashboard` 

`| | | |-- CypherEditor.tsx # Raw Cypher query (debug)` 

`| |-- package.json` 

`|` 

`|-- docker-compose.yml # Django + Neo4j + Frontend` 

`|-- sample_documents/` 

`|-- eval_dataset/` 

`|-- .env.example` 

`|-- .gitignore` 

Confidential \- For Internal Use Only  
Assignment \#10: GraphRAG & Knowledge Graph AI | Excellence Technologies Page 11 `|-- README.md` 

Confidential \- For Internal Use Only  
Assignment \#10: GraphRAG & Knowledge Graph AI | Excellence Technologies Page 12 

 **6\. UI Screens & Layout** 

**Screen 1: Query \+ Graph View (Main)** 

\- Left panel (40%): Query input at top, answer display below with markdown \+ source citations \+ reasoning chain for multi-hop queries 

\- Right panel (60%): Interactive knowledge graph visualization. When a query is answered, relevant entities and paths glow/highlight on the graph 

\- Bottom: source toggle \- show which retrieval method was used (graph/vector/hybrid) with context preview \- Click any entity on the graph to see details in a slide-out panel (description, relationships, source document) 

**Screen 2: Graph Explorer** 

\- Full-screen interactive graph with controls: zoom, pan, search, filter by entity type, filter by document source \- Entity type legend with toggle visibility per type 

\- Search bar: find entities by name, highlight on graph 

\- Relationship type filter: show/hide specific relationship types 

\- Statistics sidebar: total nodes, edges, entity type distribution (bar chart), most connected entities (top 10\) 

**Screen 3: Community View** 

\- Communities displayed as colored clusters on the graph or as separate cards 

\- Each community card: auto-generated label, member count, summary paragraph, key entities listed \- Click community to expand and see the internal graph of that community 

\- Document-level summary assembled from all community summaries 

**Screen 4: Multi-Hop Reasoning View** 

\- When a multi-hop query is answered, show the reasoning path as a visual chain: Entity A \-\[rel\]-\> Entity B \-\[rel\]-\> Entity C 

\- Each step annotated with the relationship type and source document 

\- The path is highlighted on the main graph visualization 

\- Alternative paths shown if multiple exist ('Path 1 via B, Path 2 via D') 

**Screen 5: Retrieval Comparison** 

\- Three-column layout: Graph Answer | Vector Answer | Hybrid Answer for same query 

\- Each column shows: answer text, retrieval source details, confidence, response time 

\- Bottom: summary comparison table \+ verdict (which approach was best and why) 

\- Evaluation metrics if eval dataset is available 

**Screen 6: Document Management & Graph Building** 

\- Upload documents with progress indicator and processing status 

Confidential \- For Internal Use Only  
Assignment \#10: GraphRAG & Knowledge Graph AI | Excellence Technologies Page 13 

\- Processing steps shown: 'Loading document \-\> Extracting entities (47 found) \-\> Extracting relationships (82 found) \-\> Resolving duplicates \-\> Building graph \-\> Done' 

\- Document list with: name, entity count, relationship count, upload date, process status 

\- Click document to see its entities and relationships (filtered view of the graph) 

Confidential \- For Internal Use Only  
Assignment \#10: GraphRAG & Knowledge Graph AI | Excellence Technologies Page 14 

 **7\. Feature Breakdown & Priority** 

**Must-Have (Core \- Required)** 

**1\.** Django backend with DRF, Neo4j integration, and vector DB (ChromaDB) 

**2\.** LLM-powered entity extraction from uploaded documents (at least 5 entity types) 

**3\.** LLM-powered relationship extraction between entities (at least 8 relationship types) 

**4\.** Entity resolution/deduplication (merge 'John Smith' and 'J. Smith') 

**5\.** Neo4j graph construction with entities as nodes and relationships as edges with properties **6\.** Graph-based retrieval: entity lookup \+ subgraph extraction as context for Q\&A 

**7\.** Vector-based retrieval: standard semantic search on text chunks (for comparison) 

**8\.** Hybrid retrieval: combined graph \+ vector context for best answers 

**9\.** Natural language to Cypher: convert user queries to Cypher, execute on Neo4j 

**10\.** Multi-hop reasoning: find paths between entities, present reasoning chains 

**11\.** Interactive graph visualization with entity type colors, click-to-explore, search (react-force-graph) **12\.** Query-driven graph highlighting: when answering a query, highlight relevant entities/paths on graph **13\.** Graph statistics: total nodes, edges, type distribution, hub entities 

**14\.** Retrieval comparison: graph-only vs. vector-only vs. hybrid side-by-side 

**15\.** Django admin registered for all models, docker-compose.yml with Neo4j service 

**Good-to-Have (Intermediate)** 

**1\.** Community detection using Louvain or Label Propagation algorithm 

**2\.** Auto-generated community labels and summaries via LLM 

**3\.** Hierarchical document summarization from community summaries 

**4\.** Incremental graph updates when new documents are added 

**5\.** Entity detail panel with all relationships, source references, and description history 

**6\.** Graph filtering by entity type, document source, and relationship type 

**7\.** Evaluation dataset with multi-hop questions, comparison results in README 

**8\.** Processing status with real-time updates during document ingestion 

**9\.** Entity search with fuzzy matching across the entire graph 

**10\.** Cypher query editor for advanced users/debugging 

**Bonus (Advanced)** 

**1\.** Temporal graph: track when relationships were established, query 'as of date X' 

**2\.** Graph merging across multiple documents with cross-document entity resolution 

**3\.** Entity importance scoring (PageRank or betweenness centrality) to identify key entities **4\.** Automatic relationship type discovery: LLM discovers new relationship types not in the predefined list 

Confidential \- For Internal Use Only  
Assignment \#10: GraphRAG & Knowledge Graph AI | Excellence Technologies Page 15 

**5\.** Graph diff: upload a new version of a document, show what entities/relationships changed **6\.** 3D graph visualization option (react-force-graph-3d) 

**7\.** spaCy NER pre-processing before LLM extraction for faster/cheaper entity extraction 

**8\.** Graph export as JSON-LD, RDF, or Neo4j dump for interoperability 

Confidential \- For Internal Use Only  
Assignment \#10: GraphRAG & Knowledge Graph AI | Excellence Technologies Page 16 

 **8\. Evaluation Criteria** 

 **Criteria Weight What We Look For** 

 Graph Quality 25% Entities meaningful, relationships accurate, dedup works, graph is useful  GraphRAG Retrieval 25% Graph retrieval finds relevant context, multi-hop works, hybrid improves answers  Visualization 15% Interactive graph, entity exploration, query highlighting, community view  Django & Neo4j 15% Proper DRF, Neo4j integration clean, Cypher correct, admin setup  Code Quality 10% Modular services, clean extraction pipeline, proper error handling  Documentation 5% Architecture, Neo4j setup, graph schema diagram, comparison results  Bonus Features 5% Communities, temporal, PageRank, 3D graph, graph diff 

**What Impresses Us** 

\- A knowledge graph that genuinely captures the key entities and relationships from complex documents \- Multi-hop reasoning that correctly traverses 3+ relationship hops to answer complex questions \- Comparison results showing GraphRAG outperforming vector RAG on relationship/entity questions \- Graph visualization where clicking an entity and exploring connections feels intuitive and fast \- Entity resolution that correctly merges duplicates across sections and documents 

\- Community detection that produces meaningful, well-labeled clusters 

\- NL-to-Cypher that generates correct, efficient Cypher queries for diverse question types 

**Common Mistakes to Avoid** 

\- Extracting too many generic entities ('the company', 'the report', 'it') \- entities must be specific and named \- Relationships without meaningful types ('related\_to' for everything \- use specific types) 

\- No entity resolution: graph has 5 nodes for the same person under different names 

\- Graph visualization that crashes or freezes on 100+ nodes (use WebGL-based renderer) \- NL-to-Cypher that only works for trivial queries (must handle relationship traversals) 

\- Not including docker-compose.yml with Neo4j (reviewers cannot test without it) 

\- No comparison with vector RAG: you must demonstrate where GraphRAG adds value 

 **9\. Submission Guidelines** 

**What to Submit** 

**1\.** GitHub Repository \- Include docker-compose.yml with Neo4j, sample\_documents/, eval\_dataset/. Full commit history. 

**2\.** README.md \- Neo4j setup (docker-compose), graph schema diagram, architecture overview, screenshots Confidential \- For Internal Use Only  
Assignment \#10: GraphRAG & Knowledge Graph AI | Excellence Technologies Page 17 

of graph visualization \+ multi-hop reasoning \+ comparison results. 

**3\.** .env.example \- Neo4j credentials, LLM API keys, all configuration. 

**4\.** Demo Video (Recommended) \- 5-7 min: upload document, show graph being built, explore the graph, ask multi-hop question, show path reasoning, compare graph vs. vector, show community detection. 

**Submission Deadline** 

Submit within 4 days of receiving this assignment. 

Confidential \- For Internal Use Only  
Assignment \#10: GraphRAG & Knowledge Graph AI | Excellence Technologies Page 18 

 **10\. Getting Started Guide** 

**Day 1: Neo4j Setup & Extraction Pipeline** 

\- Set up Neo4j via Docker: docker run \--name neo4j \-p 7474:7474 \-p 7687:7687 \-e NEO4J\_AUTH=neo4j/password neo4j:latest 

\- Verify Neo4j at http://localhost:7474 (browser UI) 

\- Initialize Django project with DRF, install neo4j Python driver 

\- Build entity extraction service: LLM extracts entities from document sections 

\- Build relationship extraction service: LLM extracts relationships between entities 

\- Build entity resolver: fuzzy match \+ LLM to merge duplicates 

\- Build graph builder: insert entities/relationships into Neo4j 

\- Test: upload a sample document, inspect graph in Neo4j Browser 

**Day 2: Retrieval & Reasoning** 

\- Build graph retriever: entity lookup \+ subgraph extraction from Neo4j 

\- Build vector retriever: embed document chunks in ChromaDB, semantic search 

\- Build hybrid retriever: combine graph \+ vector contexts 

\- Build NL-to-Cypher service: LLM converts queries to Cypher, execute on Neo4j 

\- Build multi-hop reasoner: find paths between entities, construct reasoning chains 

\- Build RAG chain: take query \-\> retrieve (graph/vector/hybrid) \-\> generate answer 

\- Build comparison endpoint: run all 3 strategies, return results side-by-side 

\- Build community detection (Louvain algorithm or Neo4j GDS) and LLM labeling 

**Day 3: Next.js Frontend** 

\- Initialize Next.js project with Tailwind \+ shadcn/ui 

\- Install and set up react-force-graph for graph visualization 

\- Build main page: query panel (left) \+ graph visualization (right) 

\- Implement graph interaction: click nodes, explore, search, filter by type 

\- Build query highlighting: after answering, highlight relevant nodes/edges 

\- Build multi-hop path visualization component 

\- Build comparison view (3-column: graph vs. vector vs. hybrid) 

\- Build community view with cluster cards and summaries 

**Day 4: Polish, Evaluate & Submit** 

\- Build document management page with processing status 

\- Build graph statistics dashboard 

\- Create evaluation dataset: 15+ questions including multi-hop, entity-specific, and broad queries Confidential \- For Internal Use Only  
Assignment \#10: GraphRAG & Knowledge Graph AI | Excellence Technologies Page 19 

\- Run evaluation comparing graph vs. vector vs. hybrid \- include results in README 

\- Write docker-compose.yml with Django \+ Neo4j \+ Frontend services 

\- Write comprehensive README with graph schema diagram and screenshots 

\- Record demo video and submit 

 **11\. Helpful Resources** 

**Neo4j & Graph Databases** 

\- Neo4j Documentation: neo4j.com/docs/ 

\- Cypher Query Language: neo4j.com/docs/cypher-manual/ 

\- Neo4j Python Driver: neo4j.com/docs/python-manual/ 

\- Neo4j Docker: hub.docker.com/\_/neo4j 

\- Graph Data Science (GDS): neo4j.com/docs/graph-data-science/ 

**GraphRAG Concepts** 

\- Microsoft GraphRAG: search 'Microsoft GraphRAG paper 2024' 

\- LangChain Neo4j: python.langchain.com/docs/integrations/graphs/neo4j\_cypher 

\- GraphCypherQAChain: search 'LangChain GraphCypherQAChain tutorial' 

\- Community detection: search 'Louvain community detection algorithm' 

**Visualization & Frontend** 

\- react-force-graph: github.com/vasturiano/react-force-graph 

\- Next.js: nextjs.org/docs 

\- shadcn/ui: ui.shadcn.com 

 **12\. Questions?** 

This assignment introduces a new paradigm: structured knowledge retrieval. The quality of your entity and relationship extraction directly determines everything downstream. Invest time in crafting great extraction prompts. Test with complex, relationship-rich documents (org charts, technical architectures, contract networks). If you have questions about requirements, reach out. 

Good luck\! Build the system that sees connections humans would miss. 

\--- End of Assignment \#10 \--- 

Confidential \- For Internal Use Only