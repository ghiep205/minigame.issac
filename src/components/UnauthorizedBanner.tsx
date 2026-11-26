import { ShieldAlert } from 'lucide-react';

interface UnauthorizedBannerProps {
  userId: string;
  email: string;
  requiredRole: 'admin' | 'operator';
  actualRole?: string | null;
  profileError?: string | null;
}

export function UnauthorizedBanner({
  userId,
  email,
  requiredRole,
  actualRole,
  profileError,
}: UnauthorizedBannerProps) {
  const sqlSnippet = `insert into public.admin_profiles (id, email, role)\nvalues ('${userId}', '${email}', 'admin')\non conflict (id) do update set role = 'admin';`;

  return (
    <div className="max-w-2xl mx-auto my-12 rounded-2xl bg-white border border-amber-200 p-6 shadow-sm space-y-4 text-slate-800">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shrink-0">
          <ShieldAlert className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-slate-900">
            Authorization Required ({requiredRole === 'admin' ? 'Admin' : 'Admin or MC'})
          </h2>
          <p className="text-sm text-slate-600">
            You are signed in as <span className="font-mono text-slate-900">{email}</span>,{' '}
            {actualRole
              ? `but your current role is "${actualRole}".`
              : 'but this user is not registered in public.admin_profiles yet.'}
          </p>
          {profileError && (
            <p className="text-xs font-mono text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">
              Supabase query error: {profileError}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-500">
          Run this SQL in your Supabase SQL Editor to grant access:
        </p>
        <pre className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 text-xs font-mono text-slate-800 overflow-x-auto">
          {sqlSnippet}
        </pre>
      </div>
    </div>
  );
}
