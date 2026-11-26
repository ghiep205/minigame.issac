'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Lock, Mail, AlertCircle, Loader2, ArrowLeft, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next') || '/admin';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        setError(signInError.message);
        setLoading(false);
        return;
      }

      router.push(nextPath);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to sign in. Check configuration.'
      );
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F4F7FB] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-5">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>

        <div className="rounded-2xl bg-white border border-slate-200/80 p-8 shadow-[0_4px_24px_rgba(15,23,42,0.05)] space-y-6">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                Operator Sign In
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Sign in with your Admin or MC account to access{' '}
                <span className="font-mono text-sky-700">{nextPath}</span>.
              </p>
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3.5 flex items-start gap-2.5 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="block text-sm font-medium text-slate-700"
              >
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  className="w-full rounded-xl bg-slate-50 border border-slate-200 pl-10 pr-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-sky-400"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-700"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl bg-slate-50 border border-slate-200 pl-10 pr-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-sky-400"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-sky-500 hover:bg-sky-600 disabled:opacity-60 text-white font-semibold py-2.5 text-sm flex items-center justify-center gap-2 transition-colors shadow-xs cursor-pointer"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F4F7FB] flex items-center justify-center text-slate-500">
          Loading...
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
