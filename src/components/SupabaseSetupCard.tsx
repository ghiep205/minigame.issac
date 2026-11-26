import Link from 'next/link';
import { Database, ArrowLeft } from 'lucide-react';

export function SupabaseSetupCard() {
  return (
    <div className="min-h-screen bg-[#F4F7FB] text-slate-900 flex items-center justify-center p-6">
      <div className="max-w-xl w-full rounded-2xl bg-white border border-slate-200/80 p-7 space-y-5 shadow-[0_4px_24px_rgba(15,23,42,0.05)]">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600 shrink-0">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              Supabase Configuration Required
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Environment variables{' '}
              <code className="text-sky-700 font-semibold">NEXT_PUBLIC_SUPABASE_URL</code>{' '}
              and{' '}
              <code className="text-sky-700 font-semibold">
                NEXT_PUBLIC_SUPABASE_ANON_KEY
              </code>{' '}
              are not set yet.
            </p>
          </div>
        </div>

        <div className="rounded-xl bg-[#EBF6FF] border border-sky-200/70 p-4 space-y-2 text-xs text-slate-700">
          <p className="font-semibold text-slate-900">Quick Setup:</p>
          <ol className="list-decimal list-inside space-y-1.5 text-slate-600">
            <li>
              Copy <code className="text-slate-900 font-semibold">.env.example</code> to{' '}
              <code className="text-slate-900 font-semibold">.env.local</code> and fill in
              your Supabase project URL &amp; anon key.
            </li>
            <li>
              Run <code className="text-slate-900 font-semibold">supabase/schema.sql</code> in
              the Supabase SQL Editor.
            </li>
            <li>
              Restart <code className="text-slate-900 font-semibold">npm run dev</code> and
              refresh this page.
            </li>
          </ol>
        </div>

        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-semibold text-sky-600 hover:text-sky-700"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>
      </div>
    </div>
  );
}
