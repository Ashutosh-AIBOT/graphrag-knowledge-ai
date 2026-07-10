'use client';

import { useDocumentsStore } from '@/store/documents';
import { Loader2 } from 'lucide-react';

export function TopBar({ title }: { title: string }) {
  const activeJobs = useDocumentsStore((s) => s.activeJobs);
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-bg-base px-4 lg:px-6">
      <h1 className="text-base font-semibold tracking-tight">{title}</h1>
      {activeJobs > 0 && (
        <div className="flex items-center gap-2 rounded-full bg-accent-cyan/10 px-3 py-1 text-xs font-medium text-accent-cyan">
          <Loader2 className="h-3 w-3 animate-spin" />
          {activeJobs} processing
        </div>
      )}
    </header>
  );
}
