import { requireAdmin } from '@/lib/auth';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { AdminNav } from '@/components/AdminNav';
import { UnauthorizedBanner } from '@/components/UnauthorizedBanner';
import { SupabaseSetupCard } from '@/components/SupabaseSetupCard';
import { QuestionsManager } from '@/components/QuestionsManager';

export const dynamic = 'force-dynamic';

export default async function AdminQuestionsPage() {
  if (!isSupabaseConfigured()) {
    return <SupabaseSetupCard />;
  }

  const auth = await requireAdmin('/admin/questions');

  return (
    <div className="min-h-dvh bg-[#F4F7FB] text-slate-900">
      <AdminNav email={auth.email} role={auth.profile?.role} />
      <main className="max-w-7xl mx-auto px-0 sm:px-6 py-0 sm:py-8">
        {auth.profile?.role !== 'admin' ? (
          <UnauthorizedBanner
            userId={auth.userId}
            email={auth.email}
            requiredRole="admin"
            actualRole={auth.profile?.role}
            profileError={auth.profileError}
          />
        ) : (
          <QuestionsManager />
        )}
      </main>
    </div>
  );
}
