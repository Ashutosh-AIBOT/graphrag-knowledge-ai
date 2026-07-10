'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

export default function DashboardGroupLayout({ children }: { children: React.ReactNode }) {
  const isAuthed = useAuthStore((s) => s.isAuthenticated);
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Wait for Zustand persisted state to rehydrate (50ms)
    const timer = setTimeout(() => setIsReady(true), 50);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (isReady && !isAuthed) {
      router.replace('/login');
    }
  }, [isReady, isAuthed, router]);

  if (!isReady || !isAuthed) return null;

  return <DashboardLayout>{children}</DashboardLayout>;
}
