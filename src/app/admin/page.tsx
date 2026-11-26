import Link from 'next/link';
import {
  HelpCircle,
  PlaySquare,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { AdminNav } from '@/components/AdminNav';
import { UnauthorizedBanner } from '@/components/UnauthorizedBanner';
import { SupabaseSetupCard } from '@/components/SupabaseSetupCard';
import { TEAM_CONFIG, TEAMS, type GameSession } from '@/types/quiz';

export const dynamic = 'force-dynamic';

export default async function AdminOverviewPage() {
  if (!isSupabaseConfigured()) {
    return <SupabaseSetupCard />;
  }

  const auth = await requireAdmin('/admin');

  if (auth.profile?.role !== 'admin') {
    return (
      <div className="min-h-screen bg-[#0B1120]">
        <AdminNav email={auth.email} role={auth.profile?.role} />
        <div className="px-4">
          <UnauthorizedBanner
            userId={auth.userId}
            email={auth.email}
            requiredRole="admin"
            actualRole={auth.profile?.role}
            profileError={auth.profileError}
          />
        </div>
      </div>
    );
  }

  const supabase = await createClient();

  const [questionsRes, sessionsRes, recentSessionsRes] = await Promise.all([
    supabase.from('questions').select('team, is_active'),
    supabase.from('game_sessions').select('id', { count: 'exact', head: true }),
    supabase
      .from('game_sessions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  const allQuestions = questionsRes.data ?? [];
  const totalQuestions = allQuestions.length;
  const activeQuestions = allQuestions.filter((q) => q.is_active).length;

  const teamStats = TEAMS.map((team) => {
    const teamQs = allQuestions.filter((q) => q.team === team);
    const active = teamQs.filter((q) => q.is_active).length;
    return {
      team,
      total: teamQs.length,
      active,
      ready: active >= 15,
    };
  });

  const teamsUnder15 = teamStats.filter((t) => !t.ready);
  const totalSessions = sessionsRes.count ?? 0;
  const recentSessions = (recentSessionsRes.data ?? []) as GameSession[];

  return (
    <div className="min-h-screen bg-[#0B1120] text-slate-100">
      <AdminNav email={auth.email} role={auth.profile.role} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Admin Overview</h1>
            <p className="text-sm text-slate-400">
              Monitor question bank readiness and recent quiz sessions.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin/questions"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-medium text-white transition-colors"
            >
              <HelpCircle className="w-4 h-4" />
              Manage Questions
            </Link>
            <Link
              href="/admin/sessions"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white transition-colors"
            >
              <PlaySquare className="w-4 h-4" />
              New Game Session
            </Link>
          </div>
        </div>

        {teamsUnder15.length > 0 ? (
          <div className="rounded-xl bg-amber-950/40 border border-amber-700/60 p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-100 space-y-1">
              <p className="font-semibold">
                Question Bank Not Ready for Full 45-Question Session
              </p>
              <p className="text-amber-200/80">
                A full session requires at least 15 active questions per team.
                Currently short:{' '}
                {teamsUnder15
                  .map((t) => `${TEAM_CONFIG[t.team].label} (${t.active}/15 active)`)
                  .join(', ')}
                .
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-xl bg-emerald-950/40 border border-emerald-700/50 p-4 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <p className="text-sm text-emerald-100">
              All 3 teams have at least 15 active questions. Ready to start a
              full 45-question session.
            </p>
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="rounded-xl bg-slate-900 border border-slate-800 p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Total Questions
            </p>
            <p className="text-3xl font-bold text-white mt-2">{totalQuestions}</p>
            <p className="text-xs text-slate-400 mt-1">
              {activeQuestions} active / {totalQuestions - activeQuestions} inactive
            </p>
          </div>

          <div className="rounded-xl bg-slate-900 border border-slate-800 p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Active Questions
            </p>
            <p className="text-3xl font-bold text-emerald-400 mt-2">
              {activeQuestions}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Eligible for session pool selection
            </p>
          </div>

          <div className="rounded-xl bg-slate-900 border border-slate-800 p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Game Sessions
            </p>
            <p className="text-3xl font-bold text-white mt-2">{totalSessions}</p>
            <p className="text-xs text-slate-400 mt-1">
              Created in Supabase
            </p>
          </div>
        </div>

        {/* Team Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {teamStats.map((stat) => {
            const cfg = TEAM_CONFIG[stat.team];
            return (
              <div
                key={stat.team}
                className="rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-2 font-semibold text-white">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: cfg.hex }}
                    />
                    {cfg.label}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      stat.ready
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                        : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                    }`}
                  >
                    {stat.ready ? 'Ready (15+)' : `Need ${15 - stat.active} more`}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className="text-2xl font-bold text-white">
                      {stat.active}
                    </span>
                    <span className="text-sm text-slate-400 ml-1.5">active</span>
                  </div>
                  <span className="text-xs text-slate-400">
                    {stat.total} total
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, (stat.active / 15) * 100)}%`,
                      backgroundColor: cfg.hex,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Recent Game Sessions */}
        <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
            <h2 className="font-semibold text-white">Recent Game Sessions</h2>
            <Link
              href="/admin/sessions"
              className="text-xs text-blue-400 hover:text-blue-300 inline-flex items-center gap-1"
            >
              View all <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          {recentSessions.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">
              No game sessions yet. Create one in Sessions to begin.
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {recentSessions.map((session) => (
                <div
                  key={session.id}
                  className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div>
                    <p className="font-medium text-white">
                      {session.session_name}
                    </p>
                    <p className="text-xs text-slate-400">
                      Question {session.current_question_number} /{' '}
                      {session.questions_per_team * 3} ·{' '}
                      {new Date(session.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs uppercase tracking-wider px-2.5 py-1 rounded-md bg-slate-800 text-slate-300 font-medium">
                      {session.status}
                    </span>
                    <Link
                      href={`/control?sessionId=${session.id}`}
                      className="text-xs font-medium text-blue-400 hover:text-blue-300"
                    >
                      Open Control
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
