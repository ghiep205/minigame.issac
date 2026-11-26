import { ShieldAlert } from 'lucide-react';

interface UnauthorizedBannerProps {
  userId: string;
  email: string;
  requiredRole: 'admin' | 'operator';
  actualRole?: string | null;
}

export function UnauthorizedBanner({
  userId,
  email,
  requiredRole,
  actualRole,
}: UnauthorizedBannerProps) {
  const sqlSnippet = `insert into public.admin_profiles (id, email, role)\nvalues ('${userId}', '${email}', 'admin')\non conflict (id) do update set role = 'admin';`;

  return (
    <div className="max-w-2xl mx-auto my-12 rounded-xl bg-amber-950/40 border border-amber-700/60 p-6 space-y-4 text-amber-100">
      <div className="flex items-start gap-3">
        <ShieldAlert className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-white">
            Authorization Required ({requiredRole === 'admin' ? 'Admin' : 'Admin or MC'})
          </h2>
          <p className="text-sm text-amber-200/90">
            You are signed in as <span className="font-mono">{email}</span>,{' '}
            {actualRole
              ? `but your current role is "${actualRole}".`
              : 'but this user is not registered in public.admin_profiles yet.'}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-amber-200/80">
          Run this SQL in your Supabase SQL Editor to grant access:
        </p>
        <pre className="rounded-lg bg-slate-950 border border-slate-800 p-3 text-xs font-mono text-slate-200 overflow-x-auto">
          {sqlSnippet}
        </pre>
      </div>
    </div>
  );
}

