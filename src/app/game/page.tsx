import { isSupabaseConfigured } from '@/lib/supabase/config';
import { SupabaseSetupCard } from '@/components/SupabaseSetupCard';
import { ProjectorGameScreen } from '@/components/ProjectorGameScreen';

export const dynamic = 'force-dynamic';

export default async function GamePage({
  searchParams,
}: {
  searchParams: Promise<{ sessionId?: string }>;
}) {
  if (!isSupabaseConfigured()) {
    return <SupabaseSetupCard />;
  }

  const params = await searchParams;
  return <ProjectorGameScreen initialSessionId={params.sessionId} />;
}
