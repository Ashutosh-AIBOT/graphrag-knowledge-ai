'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface TabsContext {
  value: string;
  setValue: (v: string) => void;
}
const TabsCtx = React.createContext<TabsContext>({ value: '', setValue: () => {} });

export function Tabs({
  value: controlled,
  onValueChange,
  defaultValue,
  children,
  className,
}: {
  value?: string;
  onValueChange?: (v: string) => void;
  defaultValue?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [internal, setInternal] = React.useState(defaultValue || '');
  const value = controlled ?? internal;
  const setValue = (v: string) => {
    if (!controlled) setInternal(v);
    onValueChange?.(v);
  };
  return (
    <TabsCtx.Provider value={{ value, setValue }}>
      <div className={className}>{children}</div>
    </TabsCtx.Provider>
  );
}

export function TabsList({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('inline-flex items-center justify-center gap-1 rounded-md bg-bg-elevated p-1', className)}
      {...props}
    />
  );
}

export function TabsTrigger({
  value,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }) {
  const { value: active, setValue } = React.useContext(TabsCtx);
  return (
    <button
      onClick={() => setValue(value)}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded px-3 py-1.5 text-sm font-medium transition-all',
        active === value
          ? 'bg-accent-violet text-white shadow'
          : 'text-text-secondary hover:text-text-primary',
        className
      )}
      {...props}
    />
  );
}

export function TabsContent({
  value,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { value: string }) {
  const { value: active } = React.useContext(TabsCtx);
  if (active !== value) return null;
  return <div className={cn('mt-3 animate-fade-in', className)} {...props} />;
}
