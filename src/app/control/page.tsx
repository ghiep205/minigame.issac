import { requireOperator } from '@/lib/auth';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { AdminNav } from '@/components/AdminNav';
import { UnauthorizedBanner } from '@/components/UnauthorizedBanner';
import { SupabaseSetupCard } from '@/components/SupabaseSetupCard';
import { MCControlPanel } from '@/components/MCControlPanel';

export const dynamic = 'force-dynamic';

export default async function ControlPage({
  searchParams,
}: {
  searchParams: Promise<{ sessionId?: string }>;
}) {
  if (!isSupabaseConfigured()) {
    return <SupabaseSetupCard />;
  }

  const auth = await requireOperator('/control');
  const params = await searchParams;

  if (!auth.profile || !['admin', 'mc'].includes(auth.profile.role)) {
    return (
      <div className="min-h-screen bg-[#0B1120]">
        <AdminNav email={auth.email} role={auth.profile?.role} />
        <div className="px-4">
          <UnauthorizedBanner
            userId={auth.userId}
            email={auth.email}
            requiredRole="operator"
            actualRole={auth.profile?.role}
          />
        </div>
      </div>
    );
  }

  return (
    <MCControlPanel
      initialSessionId={params.sessionId}
      operatorEmail={auth.email}
      operatorRole={auth.profile.role}
    />
  );
}
