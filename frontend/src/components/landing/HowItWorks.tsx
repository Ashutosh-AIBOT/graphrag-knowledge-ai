import { Upload, Workflow, MessageSquare } from 'lucide-react';

const STEPS = [
  {
    icon: Upload,
    title: 'Upload',
    desc: 'Upload your documents (PDF, TXT, DOCX, MD).',
  },
  {
    icon: Workflow,
    title: 'Build Graph',
    desc: 'Auto-extract entities and relationships. Build the knowledge graph in Neo4j.',
  },
  {
    icon: MessageSquare,
    title: 'Query & Discover',
    desc: 'Ask questions in natural language. Get graph-grounded answers with visual paths.',
  },
];

export function HowItWorks() {
  return (
    <section className="border-y border-border bg-bg-surface">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-center text-3xl font-bold tracking-tight">How it works</h2>
        <div className="mt-10 flex flex-col items-center gap-6 md:flex-row md:justify-center md:gap-0">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={s.title} className="flex flex-1 items-center">
                <div className="flex flex-col items-center text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-violet text-white">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-3 font-semibold">{s.title}</h3>
                  <p className="mt-1 max-w-xs text-sm text-text-secondary">{s.desc}</p>
                </div>
                {i < STEPS.length - 1 && (
                  <div className="mx-4 hidden h-px w-16 bg-border md:block" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
