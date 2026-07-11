'use client';

import Link from 'next/link';
import { Network } from 'lucide-react';
import { HeroSection } from '@/components/landing/HeroSection';
import { FeaturesSection } from '@/components/landing/FeaturesSection';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { StatsCounter } from '@/components/landing/StatsCounter';
import { Footer } from '@/components/landing/Footer';
import { ThemeToggle } from '@/components/layout/ThemeToggle';

export function LandingPage() {
  return (
    <div className="min-h-screen bg-bg-base">
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-border/60 bg-bg-base/80 px-6 backdrop-blur">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-violet text-white">
            <Network className="h-4 w-4" />
          </div>
          <span className="font-semibold tracking-tight">GraphRAG</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="#features" className="hidden text-text-secondary hover:text-text-primary sm:inline">
            Features
          </Link>
          <Link href="#how" className="hidden text-text-secondary hover:text-text-primary sm:inline">
            How it Works
          </Link>
          <ThemeToggle />
          <Link href="/login" className="text-text-secondary hover:text-text-primary">
            Login
          </Link>
          <Link
            href="/register"
            className="rounded-md bg-accent-violet px-3 py-1.5 font-medium text-white hover:bg-accent-violet/90"
          >
            Sign Up
          </Link>
        </nav>
      </header>

      <main className="pt-14">
        <HeroSection />
        <div id="features">
          <FeaturesSection />
        </div>
        <div id="how">
          <HowItWorks />
        </div>
        <StatsCounter />
      </main>
      <Footer />
    </div>
  );
}
