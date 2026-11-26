import Link from 'next/link';
import {
  HelpCircle,
  PlaySquare,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  LayoutDashboard,
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
      <div className="min-h-screen bg-[#F4F7FB]">
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
    <div className="min-h-dvh bg-[#F4F7FB] text-slate-900">
      <AdminNav email={auth.email} role={auth.profile.role} />

      <main className="max-w-7xl mx-auto px-0 sm:px-6 py-0 sm:py-8">
        <div className="rounded-none sm:rounded-3xl bg-white border-x-0 sm:border border-slate-200/80 shadow-none sm:shadow-[0_4px_24px_rgba(15,23,42,0.04)] p-4 sm:p-8 space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-6">
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600 shrink-0">
                <LayoutDashboard className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
                  Admin Overview
                </h1>
                <p className="text-sm text-slate-500 mt-0.5">
                  Monitor question bank readiness and recent live quiz sessions.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <Link
                href="/admin/questions"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-sm font-semibold text-slate-700 transition-colors"
              >
                <HelpCircle className="w-4 h-4 text-sky-600" />
                Manage Questions
              </Link>
              <Link
                href="/admin/sessions"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-sm font-semibold text-white transition-colors shadow-xs"
              >
                <PlaySquare className="w-4 h-4" />
                New Game Session
              </Link>
            </div>
          </div>

          {teamsUnder15.length > 0 ? (
            <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-900 space-y-0.5">
                <p className="font-semibold">
                  Question Bank Not Ready for Full 45-Question Session
                </p>
                <p className="text-amber-700">
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
            <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <p className="text-sm font-medium text-emerald-900">
                All 3 teams have at least 15 active questions. Ready to start a
                full 45-question session.
              </p>
            </div>
          )}

          {/* Team Readiness Featured Block */}
          <div className="rounded-2xl bg-[#EBF6FF] border border-sky-200/70 p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="px-2.5 py-1 rounded-lg bg-white border border-sky-200 text-xs font-bold text-sky-600">
                  3 Teams
                </span>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Question Bank Pool Status
                  </h2>
                  <p className="text-xs text-slate-500">
                    Minimum 15 active questions per team required for standard mode
                  </p>
                </div>
              </div>
              <span className="hidden sm:inline-flex px-3 py-1 rounded-full bg-white border border-sky-200/70 text-xs font-semibold text-sky-700">
                {activeQuestions} / {totalQuestions} Active
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              {teamStats.map((stat) => {
                const cfg = TEAM_CONFIG[stat.team];
                return (
                  <div
                    key={stat.team}
                    className="rounded-xl bg-white border border-sky-100 p-4 space-y-3 shadow-2xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-2 font-bold text-slate-900">
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: cfg.hex }}
                        />
                        {cfg.label}
                      </span>
                      <span
                        className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                          stat.ready
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {stat.ready ? 'Ready (15+)' : `Need ${15 - stat.active} more`}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <div>
                        <span className="text-2xl font-bold text-slate-900">
                          {stat.active}
                        </span>
                        <span className="text-xs font-medium text-slate-500 ml-1.5">
                          active
                        </span>
                      </div>
                      <span className="text-xs text-slate-400">
                        {stat.total} total
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
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
          </div>

          {/* Summary Row Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-2xl bg-slate-50/70 border border-slate-200/80 p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Total Questions
              </p>
              <p className="text-3xl font-bold text-slate-900 mt-1.5">
                {totalQuestions}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {activeQuestions} active / {totalQuestions - activeQuestions} inactive
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50/70 border border-slate-200/80 p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Active Pool
              </p>
              <p className="text-3xl font-bold text-sky-600 mt-1.5">
                {activeQuestions}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Eligible for session selection
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50/70 border border-slate-200/80 p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Game Sessions
              </p>
              <p className="text-3xl font-bold text-slate-900 mt-1.5">
                {totalSessions}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Stored in Supabase
              </p>
            </div>
          </div>

          {/* Recent Game Sessions */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">
                Recent Game Sessions
              </h2>
              <Link
                href="/admin/sessions"
                className="text-xs font-semibold text-sky-600 hover:text-sky-700 inline-flex items-center gap-1"
              >
                View all <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {recentSessions.length === 0 ? (
              <div className="rounded-2xl bg-slate-50 border border-slate-200/80 p-8 text-center text-sm text-slate-500">
                No game sessions yet. Create one in Sessions to begin.
              </div>
            ) : (
              <div className="space-y-2.5">
                {recentSessions.map((session, idx) => (
                  <div
                    key={session.id}
                    className="rounded-2xl bg-white border border-slate-200/80 px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-sky-200 transition-colors"
                  >
                    <div className="flex items-center gap-3.5">
                      <span className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 font-bold text-xs flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <div>
                        <p className="font-bold text-slate-900">
                          {session.session_name}
                        </p>
                        <p className="text-xs text-slate-500">
                          Question {session.current_question_number} /{' '}
                          {session.questions_per_team * 3} ·{' '}
                          {new Date(session.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs uppercase tracking-wider px-3 py-1 rounded-full bg-slate-100 text-slate-600 font-semibold">
                        {session.status}
                      </span>
                      <Link
                        href={`/control?sessionId=${session.id}`}
                        className="text-xs font-semibold text-sky-600 hover:text-sky-700"
                      >
                        Open Control
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
