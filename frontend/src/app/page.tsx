'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { LandingPage } from '@/components/landing/LandingPage';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { MainQueryView } from '@/components/dashboard/MainQueryView';

export default function RootPage() {
  const isAuthed = useAuthStore((s) => s.isAuthenticated);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Wait for persisted auth store to rehydrate
    const t = setTimeout(() => setReady(true), 50);
    return () => clearTimeout(t);
  }, []);

  if (!ready) return null;

  if (!isAuthed) return <LandingPage />;

  return (
    <DashboardLayout>
      <MainQueryView />
    </DashboardLayout>
  );
}
