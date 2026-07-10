'use client';

import ReactMarkdown from 'react-markdown';
import { Quote } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface Citation {
  doc: string;
  page?: string;
}

interface AnswerCardProps {
  answer: string;
  confidence?: number;
  method?: string;
  citations?: Citation[];
  loading?: boolean;
}

export function AnswerCard({ answer, confidence, method, citations, loading }: AnswerCardProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-bg-base p-4 text-sm text-text-secondary">
        <span className="h-2 w-2 animate-pulse rounded-full bg-accent-cyan" />
        Finding relevant entities and relationships...
      </div>
    );
  }
  if (!answer) return null;

  return (
    <div className="space-y-3 rounded-md border border-border bg-bg-base p-4">
      <div className="flex flex-wrap items-center gap-2">
        {method && (
          <Badge variant="info">{method}</Badge>
        )}
        {confidence !== undefined && (
          <Badge variant="success">Confidence {Math.round(confidence * 100)}%</Badge>
        )}
      </div>
      <div className="prose-invert max-w-none text-sm leading-relaxed text-text-primary">
        <ReactMarkdown>{answer}</ReactMarkdown>
      </div>
      {citations && citations.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <Quote className="h-3.5 w-3.5 text-text-muted" />
          <span className="text-xs text-text-muted">Sources:</span>
          {citations.map((c, i) => (
            <span
              key={i}
              className="rounded bg-bg-elevated px-2 py-0.5 text-xs text-text-secondary"
            >
              [{i + 1}] {c.doc} {c.page}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
