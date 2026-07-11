import { Network, GitBranch, Search, MousePointer2, Users, Zap } from 'lucide-react';

const FEATURES = [
  {
    icon: Network,
    title: 'Graph-Powered Retrieval',
    desc: 'Goes beyond vector search to understand relationships and context between entities.',
  },
  {
    icon: GitBranch,
    title: 'Multi-Hop Reasoning',
    desc: 'Follow chains of relationships to answer complex, multi-step questions.',
  },
  {
    icon: Search,
    title: 'Hybrid Search',
    desc: 'Combine graph traversal with vector similarity for the best results.',
  },
  {
    icon: MousePointer2,
    title: 'Interactive Visualization',
    desc: 'Explore your knowledge graph with zoom, pan, and click-to-inspect nodes.',
  },
  {
    icon: Users,
    title: 'Community Detection',
    desc: 'Auto-discover thematic clusters and get per-community summaries.',
  },
  {
    icon: Zap,
    title: 'Real-time Processing',
    desc: 'Watch your document transform into a structured graph in real-time.',
  },
];

export function FeaturesSection() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <h2 className="text-center text-3xl font-bold tracking-tight">
        Everything you need to understand your documents
      </h2>
      <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => {
          const Icon = f.icon;
          return (
            <div
              key={f.title}
              className="rounded-lg border border-border bg-bg-surface p-5 transition-colors hover:border-accent-violet/40"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-accent-violet/10 text-accent-violet">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-text-secondary">{f.desc}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
