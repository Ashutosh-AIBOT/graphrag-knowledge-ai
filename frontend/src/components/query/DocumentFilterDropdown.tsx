'use client';

import { useState, useRef, useEffect } from 'react';
import { Filter, ChevronDown, Search, Square, CheckSquare } from 'lucide-react';
import { useDocumentsStore } from '@/store/documents';

export function DocumentFilterDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const documents = useDocumentsStore((s) => s.documents);
  const selectedIds = useDocumentsStore((s) => s.selectedDocumentIds);
  const toggleSelect = useDocumentsStore((s) => s.toggleSelectDocument);
  const selectAll = useDocumentsStore((s) => s.selectAllDocuments);
  const deselectAll = useDocumentsStore((s) => s.deselectAllDocuments);

  const completedDocs = documents.filter((d) => d.status === 'COMPLETED');
  const filteredDocs = completedDocs.filter((d) =>
    d.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  let label = 'All Documents';
  if (selectedIds.length === 0) {
    label = 'No Documents selected';
  } else if (selectedIds.length < completedDocs.length) {
    label = `${selectedIds.length}/${completedDocs.length} selected`;
  }

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-surface px-3 py-1.5 text-xs font-semibold text-text-primary hover:border-accent-violet/50 hover:bg-bg-elevated transition-all"
      >
        <Filter className="h-3.5 w-3.5 text-text-muted" />
        <span>{label}</span>
        <ChevronDown className="h-3 w-3 text-text-muted" />
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-1.5 w-64 origin-top-right rounded-md border border-border bg-bg-surface shadow-lg focus:outline-none flex flex-col max-h-80 overflow-hidden">
          {/* Quick Actions Header */}
          <div className="flex items-center justify-between border-b border-border p-2 bg-bg-elevated/40">
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
              Filter context
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectAll}
                className="text-[10px] font-semibold text-accent-violet hover:underline"
              >
                Select All
              </button>
              <span className="text-[10px] text-text-muted">|</span>
              <button
                type="button"
                onClick={deselectAll}
                className="text-[10px] font-semibold text-text-muted hover:underline"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Search Input */}
          <div className="relative p-2 border-b border-border">
            <Search className="absolute left-4 top-3.5 h-3.5 w-3.5 text-text-muted" />
            <input
              type="text"
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded border border-border bg-bg-elevated focus:outline-none focus:ring-1 focus:ring-accent-violet text-text-primary placeholder:text-text-muted/60"
            />
          </div>

          {/* Scrollable list */}
          <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5 scrollbar-thin max-h-48">
            {completedDocs.length === 0 ? (
              <p className="text-center text-xs text-text-muted py-4">No completed documents.</p>
            ) : filteredDocs.length === 0 ? (
              <p className="text-center text-xs text-text-muted py-4">No matching documents.</p>
            ) : (
              filteredDocs.map((doc) => {
                const checked = selectedIds.includes(doc.id);
                return (
                  <div
                    key={doc.id}
                    onClick={() => toggleSelect(doc.id)}
                    className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-bg-elevated cursor-pointer transition-colors"
                  >
                    {checked ? (
                      <CheckSquare className="h-4 w-4 shrink-0 text-accent-violet" />
                    ) : (
                      <Square className="h-4 w-4 shrink-0 text-text-muted" />
                    )}
                    <span className="truncate text-xs font-medium text-text-primary" title={doc.name}>
                      {doc.name}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
