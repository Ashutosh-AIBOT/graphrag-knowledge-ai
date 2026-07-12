'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  FileText,
  Network,
  Scale,
  Globe,
  LayoutDashboard,
  LogOut,
  Menu,
  X,
  Terminal,
  GitBranch,
} from 'lucide-react';
import { useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { ThemeToggle } from './ThemeToggle';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/', label: 'Query', icon: LayoutDashboard, exact: true },
  { href: '/documents', label: 'Documents', icon: FileText },
  { href: '/explore', label: 'Explore', icon: Network },
  { href: '/multihop', label: 'Multi-Hop', icon: GitBranch },
  { href: '/compare', label: 'Compare', icon: Scale },
  { href: '/communities', label: 'Community', icon: Globe },
  { href: '/cypher', label: 'Cypher Editor', icon: Terminal },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {navItems.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-accent-violet/15 text-accent-violet'
                : 'text-text-secondary hover:bg-bg-elevated hover:text-text-primary'
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const router = useRouter();
  const handleLogout = () => {
    logout();
    router.replace('/login');
  };

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-bg-sidebar md:flex">
        <div className="flex h-14 items-center gap-2 border-b border-border px-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-violet text-white">
            <Network className="h-4 w-4" />
          </div>
          <span className="font-semibold tracking-tight">GraphRAG</span>
        </div>
        <div className="flex-1 overflow-y-auto p-3 scrollbar-thin">
          <NavLinks />
        </div>
        <div className="border-t border-border p-3">
          <div className="flex items-center gap-2 rounded-md px-2 py-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-cyan/20 text-sm font-semibold text-accent-cyan">
              {user?.username?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user?.username || 'User'}</p>
              <p className="truncate text-xs text-text-muted">{user?.email || ''}</p>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <ThemeToggle />
            <button
              onClick={logout}
              className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-elevated hover:text-error"
            >
              <LogOut className="h-4 w-4" /> Logout
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile top bar with hamburger */}
      <div className="flex items-center justify-between border-b border-border bg-bg-sidebar px-4 py-3 md:hidden">
        <div className="flex items-center gap-2">
          <button onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-semibold">GraphRAG</span>
        </div>
        <ThemeToggle />
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col bg-bg-sidebar animate-slide-in">
            <div className="flex h-14 items-center justify-between border-b border-border px-4">
              <span className="font-semibold">GraphRAG</span>
              <button onClick={() => setMobileOpen(false)} aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <NavLinks onNavigate={() => setMobileOpen(false)} />
            </div>
            <div className="border-t border-border p-3">
              <button
                onClick={logout}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-text-secondary hover:bg-bg-elevated hover:text-error"
              >
                <LogOut className="h-4 w-4" /> Logout
              </button>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
