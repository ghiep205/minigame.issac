import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { AdminProfile } from '@/types/quiz';

export interface AuthContext {
  userId: string;
  email: string;
  profile: AdminProfile | null;
  profileError?: string | null;
}

export async function getAuthContext(): Promise<AuthContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from('admin_profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  return {
    userId: user.id,
    email: user.email ?? '',
    profile: (profile as AdminProfile | null) ?? null,
    profileError: profileError?.message ?? null,
  };
}

export async function requireAdmin(nextPath = '/admin'): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) {
    redirect(`/admin/login?next=${encodeURIComponent(nextPath)}`);
  }
  return ctx;
}

export async function requireOperator(nextPath = '/control'): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) {
    redirect(`/admin/login?next=${encodeURIComponent(nextPath)}`);
  }
  return ctx;
}

