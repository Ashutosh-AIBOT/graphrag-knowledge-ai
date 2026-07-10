import { CheckCircle2, Circle, Loader2 } from 'lucide-react';

export const PROCESSING_STEPS = [
  'Loading document',
  'Extracting entities',
  'Extracting relationships',
  'Resolving duplicates',
  'Building graph',
  'Indexing vectors',
];

interface StepCounts {
  entities?: number;
  relationships?: number;
  duplicatesResolved?: number;
}

export function ProcessingSteps({
  currentStep,
  counts,
}: {
  currentStep?: string | null;
  counts?: StepCounts;
}) {
  const active = currentStep ? PROCESSING_STEPS.indexOf(currentStep) : -1;

  function getCountLabel(step: string): string | null {
    if (!counts) return null;
    switch (step) {
      case 'Extracting entities':
        return counts.entities != null ? `${counts.entities} found` : null;
      case 'Extracting relationships':
        return counts.relationships != null ? `${counts.relationships} found` : null;
      case 'Resolving duplicates':
        return counts.duplicatesResolved != null ? `${counts.duplicatesResolved} merged` : null;
      default:
        return null;
    }
  }

  return (
    <ul className="space-y-1">
      {PROCESSING_STEPS.map((s, i) => {
        const state = active < 0 ? 'pending' : i < active ? 'done' : i === active ? 'active' : 'pending';
        const countLabel = getCountLabel(s);
        return (
          <li key={s} className="flex items-center gap-2 text-xs">
            {state === 'done' ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
            ) : state === 'active' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-warning" />
            ) : (
              <Circle className="h-3.5 w-3.5 text-text-muted" />
            )}
            <span className={state !== 'pending' ? 'text-text-secondary' : 'text-text-muted'}>
              {s}
              {countLabel && (
                <span className="ml-1 text-accent-cyan">({countLabel})</span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
