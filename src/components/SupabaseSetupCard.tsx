import Link from 'next/link';
import { Database, ArrowLeft } from 'lucide-react';

export function SupabaseSetupCard() {
  return (
    <div className="min-h-screen bg-[#0B1120] text-slate-100 flex items-center justify-center p-6">
      <div className="max-w-xl w-full rounded-xl bg-slate-900 border border-slate-800 p-7 space-y-5 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">
              Supabase Configuration Required
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Environment variables{' '}
              <code className="text-slate-200">NEXT_PUBLIC_SUPABASE_URL</code>{' '}
              and{' '}
              <code className="text-slate-200">
                NEXT_PUBLIC_SUPABASE_ANON_KEY
              </code>{' '}
              are not set yet.
            </p>
          </div>
        </div>

        <div className="rounded-lg bg-slate-950 border border-slate-800 p-4 space-y-2 text-xs text-slate-300">
          <p className="font-semibold text-slate-200">Quick Setup:</p>
          <ol className="list-decimal list-inside space-y-1.5 text-slate-400">
            <li>
              Copy <code className="text-slate-200">.env.example</code> to{' '}
              <code className="text-slate-200">.env.local</code> and fill in
              your Supabase project URL &amp; anon key.
            </li>
            <li>
              Run <code className="text-slate-200">supabase/schema.sql</code> in
              the Supabase SQL Editor.
            </li>
            <li>
              Restart <code className="text-slate-200">npm run dev</code> and
              refresh this page.
            </li>
          </ol>
        </div>

        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-blue-400 hover:text-blue-300"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>
      </div>
    </div>
  );
}

