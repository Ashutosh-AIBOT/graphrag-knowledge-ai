'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Network, Mail, Lock, ArrowRight, User } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import api from '@/lib/axios';
import { ThemeToggle } from '@/components/layout/ThemeToggle';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function passwordStrength(pw: string): { label: string; color: string; width: string } {
  if (!pw) return { label: '', color: '', width: '0%' };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw)) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;
  if (score <= 2) return { label: 'Weak', color: 'bg-error', width: '25%' };
  if (score <= 4) return { label: 'Fair', color: 'bg-warning', width: '50%' };
  if (score <= 5) return { label: 'Good', color: 'bg-accent-cyan', width: '75%' };
  return { label: 'Strong', color: 'bg-success', width: '100%' };
}

export default function RegisterPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [form, setForm] = useState({ username: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const pwStrength = useMemo(() => passwordStrength(form.password), [form.password]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const trimmed = {
      username: form.username.trim(),
      email: form.email.trim(),
      password: form.password,
      confirm: form.confirm,
    };

    if (!trimmed.username) {
      setError('Username is required.');
      return;
    }
    if (!EMAIL_RE.test(trimmed.email)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!trimmed.password) {
      setError('Password is required.');
      return;
    }
    if (trimmed.password.trim().length === 0) {
      setError('Password cannot contain only spaces.');
      return;
    }
    if (trimmed.password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (trimmed.password !== trimmed.confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/register/', {
        username: trimmed.username,
        email: trimmed.email,
        password: trimmed.password,
        confirm_password: trimmed.confirm,
      });
      // Auto-login after registration
      const { data } = await api.post('/auth/login/', {
        username: form.username,
        password: form.password,
      });
      const user = data.user || { id: 0, username: form.username, email: form.email };
      setAuth(user, data.access, data.refresh);
      router.push('/');
    } catch (err: any) {
      const d = err?.response?.data;
      setError(
        d?.username?.[0] || d?.email?.[0] || d?.password?.[0] || d?.error || 'Registration failed.'
      );
    } finally {
      setLoading(false);
    }
  }

    const passwordsMatch = form.password && form.confirm && form.password === form.confirm;
  const passwordsMismatch = form.confirm && form.password !== form.confirm;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="flex min-h-screen bg-bg-base">
      <div className="flex w-full flex-col justify-center px-6 py-12 lg:w-1/2">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-violet text-white">
                <Network className="h-4 w-4" />
              </div>
              <span className="text-lg font-semibold">GraphRAG</span>
            </Link>
            <ThemeToggle />
          </div>

          <h1 className="text-2xl font-bold">Create your account</h1>
          <p className="mt-1 text-sm text-text-secondary">Start building knowledge graphs</p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Username</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                <Input value={form.username} onChange={set('username')} required placeholder="johnsmith" className="pl-9" />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                <Input type="email" value={form.email} onChange={set('email')} required placeholder="you@example.com" className="pl-9" />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                <Input type="password" value={form.password} onChange={set('password')} required placeholder="••••••••" className="pl-9" />
              </div>
              {form.password && (
                <div className="mt-1.5 space-y-1">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-elevated">
                    <div className={`h-full rounded-full transition-all ${pwStrength.color}`} style={{ width: pwStrength.width }} />
                  </div>
                  <p className="text-xs text-text-muted">Strength: {pwStrength.label}</p>
                </div>
              )}
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                <Input type="password" value={form.confirm} onChange={set('confirm')} required placeholder="••••••••" className="pl-9" />
              </div>
              {passwordsMatch && <p className="mt-1 text-xs text-success">✓ Passwords match</p>}
              {passwordsMismatch && <p className="mt-1 text-xs text-error">✗ Passwords do not match</p>}
            </div>

            {error && <p className="text-sm text-error">{error}</p>}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Creating account...' : 'Create Account'}
              {!loading && <ArrowRight className="h-4 w-4" />}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-text-secondary">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-accent-violet hover:underline">
              Login
            </Link>
          </p>
        </div>
      </div>

      <div className="relative hidden items-center justify-center overflow-hidden bg-gradient-to-br from-accent-violet/20 via-accent-indigo/20 to-accent-cyan/20 lg:flex lg:w-1/2">
        <div className="px-10 text-center">
          <h2 className="text-3xl font-bold text-text-primary">From documents to knowledge</h2>
          <p className="mt-3 text-text-secondary">
            Sign up to extract entities, build graphs, and ask questions across your entire corpus.
          </p>
        </div>
      </div>
    </div>
  );
}
