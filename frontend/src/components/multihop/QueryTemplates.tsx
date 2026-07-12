'use client';

import { Lightbulb } from 'lucide-react';

const TEMPLATES = [
  'Who manages the person who leads the team that built?',
  'What services depend on?',
  'How are two entities connected?',
  'What projects is involved in?',
  'Which organizations partner with?',
  'What technology does use?',
];

interface QueryTemplatesProps {
  onSelect: (template: string) => void;
}

export function QueryTemplates({ onSelect }: QueryTemplatesProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-text-muted">
        <Lightbulb className="h-3 w-3" />
        Try a question
      </div>
      <div className="flex flex-wrap gap-2">
        {TEMPLATES.map((t) => (
          <button
            key={t}
            onClick={() => onSelect(t)}
            className="rounded-full border border-border bg-bg-elevated px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-accent-cyan/50 hover:text-accent-cyan"
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}
