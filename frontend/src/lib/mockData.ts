import { GraphData } from '@/store/graph';
import { DocumentItem } from '@/store/documents';

const N = (
  id: string,
  name: string,
  type: string,
  val: number,
  sourceDoc: string,
  description: string,
  community?: number
) => ({ id, name, type, val, sourceDoc, description, community });

const E = (
  source: string,
  target: string,
  type: string,
  confidence = 0.9,
  sourceDoc = 'org-chart.pdf'
) => ({ source, target, type, confidence, sourceDoc });

export const mockGraph: GraphData = {
  nodes: [
    N('john', 'John Smith', 'PERSON', 8, 'org-chart.pdf', 'Chief Executive Officer', 0),
    N('alice', 'Alice Wong', 'PERSON', 6, 'org-chart.pdf', 'VP of Engineering', 0),
    N('bob', 'Bob Lee', 'PERSON', 5, 'org-chart.pdf', 'Engineering Manager', 0),
    N('team_x', 'Team X', 'ORGANIZATION', 7, 'project.pdf', 'Core product delivery team', 1),
    N('cto', 'Carol Reyes', 'PERSON', 6, 'org-chart.pdf', 'Chief Technology Officer', 1),
    N('dev_team', 'Dev Team Alpha', 'ORGANIZATION', 5, 'project.pdf', 'Backend engineering group', 1),
    N('pay_svc', 'Payment Service', 'TECHNOLOGY', 9, 'tech-docs.md', 'Core payment processing microservice', 1),
    N('auth_svc', 'Auth Service', 'TECHNOLOGY', 6, 'tech-docs.md', 'Authentication & authorization service', 1),
    N('user_db', 'User Database', 'TECHNOLOGY', 4, 'tech-docs.md', 'Primary user datastore', 1),
    N('acme', 'Acme Corporation', 'ORGANIZATION', 7, 'annual.pdf', 'Parent company', 0),
    N('board', 'Board of Directors', 'ORGANIZATION', 5, 'annual.pdf', 'Governing board', 0),
    N('revenue', 'Revenue 2025', 'CONCEPT', 4, 'annual.pdf', 'Annual revenue figure', 0),
    N('product_a', 'Product Nova', 'PRODUCT', 6, 'strategy.md', 'Flagship growth product', 2),
    N('product_b', 'Product Orbit', 'PRODUCT', 4, 'strategy.md', 'Analytics product', 2),
    N('market', 'Market Analysis', 'CONCEPT', 5, 'strategy.md', 'Target market overview', 2),
    N('research', 'Research Division', 'ORGANIZATION', 5, 'strategy.md', 'R&D organization', 3),
    N('ml_model', 'ML Classifier', 'TECHNOLOGY', 5, 'research.md', 'Text classification model', 3),
    N('dataset', 'Training Dataset', 'CONCEPT', 3, 'research.md', 'Annotated training data', 3),
    N('mit', 'MIT', 'LOCATION', 3, 'research.md', 'Research institution', 3),
    N('conf_2025', 'AI Summit 2025', 'EVENT', 3, 'events.md', 'Industry conference', 3),
    N('q1_launch', 'Q1 Launch', 'DATE', 3, 'strategy.md', 'Product launch date', 2),
    N('legal', 'Legal Team', 'ORGANIZATION', 4, 'contracts.pdf', 'Compliance & legal', 0),
    N('contract_a', 'Vendor Contract A', 'DOCUMENT', 4, 'contracts.pdf', 'Outsourcing agreement', 0),
    N('investor', 'Horizon Capital', 'ORGANIZATION', 4, 'annual.pdf', 'Lead investor', 0),
  ],
  links: [
    E('john', 'acme', 'MANAGES', 0.95),
    E('john', 'board', 'PART_OF', 0.9),
    E('alice', 'team_x', 'LEADS', 0.92, 'project.pdf'),
    E('bob', 'team_x', 'LEADS', 0.85, 'project.pdf'),
    E('team_x', 'pay_svc', 'BUILT_BY', 0.9, 'tech-docs.md'),
    E('cto', 'dev_team', 'MANAGES', 0.9),
    E('dev_team', 'auth_svc', 'BUILT_BY', 0.85, 'tech-docs.md'),
    E('pay_svc', 'auth_svc', 'DEPENDS_ON', 0.88, 'tech-docs.md'),
    E('pay_svc', 'user_db', 'DEPENDS_ON', 0.86, 'tech-docs.md'),
    E('auth_svc', 'user_db', 'DEPENDS_ON', 0.84, 'tech-docs.md'),
    E('acme', 'revenue', 'PART_OF', 0.8, 'annual.pdf'),
    E('board', 'revenue', 'RELATED_TO', 0.7, 'annual.pdf'),
    E('investor', 'acme', 'PARTNER_OF', 0.8, 'annual.pdf'),
    E('product_a', 'team_x', 'PART_OF', 0.85, 'strategy.md'),
    E('product_b', 'dev_team', 'PART_OF', 0.8, 'strategy.md'),
    E('product_a', 'market', 'RELATED_TO', 0.75, 'strategy.md'),
    E('product_a', 'q1_launch', 'PART_OF', 0.8, 'strategy.md'),
    E('research', 'ml_model', 'CREATED_BY', 0.9, 'research.md'),
    E('ml_model', 'dataset', 'DEPENDS_ON', 0.85, 'research.md'),
    E('research', 'mit', 'PARTNER_OF', 0.7, 'research.md'),
    E('research', 'conf_2025', 'PART_OF', 0.6, 'events.md'),
    E('legal', 'contract_a', 'CREATED_BY', 0.9, 'contracts.pdf'),
    E('acme', 'legal', 'PART_OF', 0.85, 'contracts.pdf'),
    E('john', 'alice', 'MANAGES', 0.9, 'org-chart.pdf'),
    E('alice', 'cto', 'RELATED_TO', 0.6, 'org-chart.pdf'),
    E('cto', 'research', 'MANAGES', 0.8, 'strategy.md'),
  ],
};

export const mockDocuments: DocumentItem[] = [
  {
    id: '1',
    name: 'annual-report.pdf',
    status: 'COMPLETED',
    entities: 124,
    relationships: 203,
    uploadedAt: '2026-07-09T15:12:00Z',
  },
  {
    id: '2',
    name: 'org-chart.pdf',
    status: 'COMPLETED',
    entities: 47,
    relationships: 82,
    uploadedAt: '2026-07-09T15:30:00Z',
  },
  {
    id: '3',
    name: 'tech-docs.md',
    status: 'PROCESSING',
    entities: 38,
    relationships: 61,
    uploadedAt: '2026-07-09T16:30:00Z',
  },
  {
    id: '4',
    name: 'vendor-contract.docx',
    status: 'PENDING',
    uploadedAt: '2026-07-09T16:31:00Z',
  },
];

export const mockCommunities = [
  {
    id: 0,
    label: 'Corporate Governance',
    entityCount: 7,
    relationshipCount: 12,
    summary:
      'Governs financial decisions and strategic direction. Connects the CEO, board, and lead investor with revenue and compliance functions.',
    keyEntities: ['John Smith', 'Board of Directors', 'Acme Corporation', 'Revenue 2025'],
  },
  {
    id: 1,
    label: 'Engineering Operations',
    entityCount: 9,
    relationshipCount: 16,
    summary:
      'Manages product delivery and technical operations. Core services (Payment, Auth) depend on the user database and are built by delivery teams.',
    keyEntities: ['Team X', 'Dev Team Alpha', 'Payment Service', 'Auth Service'],
  },
  {
    id: 2,
    label: 'Product Strategy',
    entityCount: 6,
    relationshipCount: 9,
    summary:
      'Defines market-facing product roadmap. Flagship products are tied to launch dates and target market analysis.',
    keyEntities: ['Product Nova', 'Product Orbit', 'Market Analysis', 'Q1 Launch'],
  },
  {
    id: 3,
    label: 'Research & Development',
    entityCount: 6,
    relationshipCount: 8,
    summary:
      'Drives innovation through ML research, partnering with institutions and presenting at industry events.',
    keyEntities: ['Research Division', 'ML Classifier', 'MIT', 'AI Summit 2025'],
  },
];

export const mockAnswer = {
  answer:
    '**John Smith** indirectly manages the team that built the Payment Service.\n\nThe reasoning chain is: John manages Alice, Alice leads Team X, and Team X built the Payment Service. This makes the Payment Service a downstream deliverable of John’s organization.',
  confidence: 0.94,
  method: 'Hybrid',
  citations: [
    { doc: 'org-chart.pdf', page: 'p.3' },
    { doc: 'project.pdf', page: '§4' },
    { doc: 'tech-docs.md', page: '§2' },
  ],
  entities: ['john', 'alice', 'team_x', 'pay_svc'],
  paths: ['john', 'alice', 'team_x', 'pay_svc'],
  hops: [
    { from: 'John Smith', rel: 'manages', to: 'Alice Wong', doc: 'org-chart.pdf' },
    { from: 'Alice Wong', rel: 'leads', to: 'Team X', doc: 'project.pdf' },
    { from: 'Team X', rel: 'built_by', to: 'Payment Service', doc: 'tech-docs.md' },
  ],
};

export const mockComparison = {
  query: 'Who manages the payment team?',
  results: {
    graph: {
      answer:
        'Graph retrieval identifies **Team X** as the team that built the Payment Service, then traverses management edges to find **John Smith** as the indirect manager.',
      confidence: 87,
      timeMs: 450,
      context: '3 entities • 1 subgraph',
    },
    vector: {
      answer:
        'Vector search found text chunks mentioning "John manages the engineering org" and "Team X owns the Payment Service", assembled into a coherent answer.',
      confidence: 71,
      timeMs: 320,
      context: '2 text chunks • semantic match',
    },
    hybrid: {
      answer:
        'Hybrid retrieval combines the structured management chain (John → Alice → Team X → Payment Service) with verbatim context from meeting notes, giving the most complete answer.',
      confidence: 94,
      timeMs: 680,
      context: 'Graph context • Vector context • merged',
    },
  },
  verdict:
    'Hybrid performed best for this relationship query. Graph excels at entity traversal (who → manages → who), while vector adds verbatim context from meeting notes.',
};
