'use client';

import { Search } from 'lucide-react';
import { useGraphStore } from '@/store/graph';
import { Input } from '@/components/ui/input';
import { useState } from 'react';

export function GraphSearch() {
  const setSearchTerm = useGraphStore((s) => s.setSearchTerm);
  const [value, setValue] = useState('');

  return (
    <div className="absolute left-1/2 top-3 z-20 w-64 -translate-x-1/2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <Input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSearchTerm(e.target.value);
          }}
          placeholder="Search entities..."
          className="h-9 pl-8 text-sm"
        />
      </div>
    </div>
  );
}
