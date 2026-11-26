'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Play,
  Plus,
  Trash2,
  Sliders,
  Monitor,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  PlaySquare,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { TEAM_CONFIG, TEAMS, type GameSession, type Team } from '@/types/quiz';

export function SessionsManager() {
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [activeCounts, setActiveCounts] = useState<Record<Team, number>>({
    red: 0,
    green: 0,
    blue: 0,
  });
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [sessionName, setSessionName] = useState('');
  const [gameMode, setGameMode] = useState<'standard' | 'test'>('standard');
  const [questionsPerTeam, setQuestionsPerTeam] = useState(15);
  const [timerDuration, setTimerDuration] = useState(25);
  const [autoStart, setAutoStart] = useState(false);

  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();

    const [sessionsRes, questionsRes] = await Promise.all([
      supabase
        .from('game_sessions')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase.from('questions').select('team').eq('is_active', true),
    ]);

    if (sessionsRes.error) {
      setFeedback({ type: 'error', message: sessionsRes.error.message });
    } else {
      setSessions((sessionsRes.data ?? []) as GameSession[]);
    }

    const counts: Record<Team, number> = { red: 0, green: 0, blue: 0 };
    for (const row of questionsRes.data ?? []) {
      const t = row.team as Team;
      if (counts[t] !== undefined) counts[t] += 1;
    }
    setActiveCounts(counts);
    setLoading(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      void loadData();
    }, 0);
    return () => clearTimeout(t);
  }, [loadData]);

  function handleModeChange(mode: 'standard' | 'test') {
    setGameMode(mode);
    setQuestionsPerTeam(mode === 'standard' ? 15 : 5);
  }

  const insufficientTeams = TEAMS.filter(
    (t) => activeCounts[t] < questionsPerTeam
  );

  async function handleCreateSession(e: React.FormEvent) {
    e.preventDefault();
    if (!sessionName.trim()) {
      setFeedback({ type: 'error', message: 'Session name is required.' });
      return;
    }
    if (insufficientTeams.length > 0) {
      setFeedback({
        type: 'error',
        message: `Not enough active questions for: ${insufficientTeams
          .map((t) => `${TEAM_CONFIG[t].label} (${activeCounts[t]}/${questionsPerTeam})`)
          .join(', ')}`,
      });
      return;
    }

    setCreating(true);
    setFeedback(null);

    const supabase = createClient();
    const { error } = await supabase.rpc('create_game_session', {
      p_session_name: sessionName.trim(),
      p_questions_per_team: questionsPerTeam,
      p_timer_duration: timerDuration,
      p_game_mode: gameMode,
      p_auto_start: autoStart,
    });

    if (error) {
      setFeedback({ type: 'error', message: error.message });
    } else {
      setFeedback({
        type: 'success',
        message: `Session "${sessionName.trim()}" created with ${
          questionsPerTeam * 3
        } randomly selected questions.`,
      });
      setSessionName('');
      await loadData();
    }
    setCreating(false);
  }

  async function handleDeleteSession(id: string, name: string) {
    if (!window.confirm(`Delete session "${name}"? This cannot be undone.`)) {
      return;
    }
    setFeedback(null);
    const supabase = createClient();
    const { error } = await supabase.from('game_sessions').delete().eq('id', id);

    if (error) {
      setFeedback({ type: 'error', message: error.message });
    } else {
      setFeedback({ type: 'success', message: `Session "${name}" deleted.` });
      await loadData();
    }
  }

  return (
    <div className="rounded-none sm:rounded-3xl bg-white border-x-0 sm:border border-slate-200/80 shadow-none sm:shadow-[0_4px_24px_rgba(15,23,42,0.04)] p-4 sm:p-8 space-y-6 sm:space-y-8">
      <div className="flex items-start gap-3.5 border-b border-slate-100 pb-6">
        <div className="w-11 h-11 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600 shrink-0">
          <PlaySquare className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
            Game Sessions
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Initialize new quiz sessions with randomized, non-repeating question
            pools stored in Supabase.
          </p>
        </div>
      </div>

      {feedback && (
        <div
          className={`rounded-2xl p-3.5 flex items-center gap-2.5 text-sm border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <XCircle className="w-4 h-4 text-red-500 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Setup Card */}
      <form
        onSubmit={handleCreateSession}
        className="rounded-2xl bg-[#EBF6FF] border border-sky-200/70 p-6 space-y-5"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Create New Session
            </h2>
            <p className="text-xs text-slate-500">
              Total questions in session: {questionsPerTeam * 3}
            </p>
          </div>
          <span className="px-3 py-1 rounded-full bg-white border border-sky-200/70 text-xs font-semibold text-sky-700">
            {questionsPerTeam} / team
          </span>
        </div>

        {/* Team Readiness */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {TEAMS.map((t) => {
            const cfg = TEAM_CONFIG[t];
            const ok = activeCounts[t] >= questionsPerTeam;
            return (
              <div
                key={t}
                className="rounded-xl bg-white border border-sky-100 px-4 py-3 flex items-center justify-between shadow-2xs"
              >
                <span className="inline-flex items-center gap-2 text-sm font-bold text-slate-800">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: cfg.hex }}
                  />
                  {cfg.label}
                </span>
                <span
                  className={`text-xs font-semibold ${
                    ok ? 'text-emerald-600' : 'text-amber-600'
                  }`}
                >
                  {activeCounts[t]} / {questionsPerTeam} active
                </span>
              </div>
            );
          })}
        </div>

        {insufficientTeams.length > 0 && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-center gap-2.5 text-xs text-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            <span>
              Add more active questions in{' '}
              <Link href="/admin/questions" className="underline font-semibold">
                Questions
              </Link>{' '}
              or switch to Test Mode (5 per team).
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-2 space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">
              Session Name *
            </label>
            <input
              type="text"
              required
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              placeholder="e.g. ISSAC Live Quiz Finals 2026"
              className="w-full rounded-xl bg-white border border-sky-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-sky-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">
              Game Mode
            </label>
            <select
              value={gameMode}
              onChange={(e) =>
                handleModeChange(e.target.value as 'standard' | 'test')
              }
              className="w-full rounded-xl bg-white border border-sky-200 px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-sky-500"
            >
              <option value="standard">Standard (15 / team = 45)</option>
              <option value="test">Test Mode (5 / team = 15)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">
              Timer (seconds)
            </label>
            <input
              type="number"
              min={5}
              max={180}
              value={timerDuration}
              onChange={(e) =>
                setTimerDuration(Math.max(5, Number(e.target.value) || 25))
              }
              className="w-full rounded-xl bg-white border border-sky-200 px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-sky-500"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
          <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={autoStart}
              onChange={(e) => setAutoStart(e.target.checked)}
              className="rounded border-slate-300 text-sky-600"
            />
            Start session immediately (load Question 1 for Team Red)
          </label>

          <button
            type="submit"
            disabled={creating || insufficientTeams.length > 0}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-sm font-semibold text-white transition-colors shadow-xs cursor-pointer"
          >
            {creating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Create Game Session
          </button>
        </div>
      </form>

      {/* Sessions List */}
      <div className="space-y-3">
        <h2 className="text-base font-bold text-slate-900">All Sessions</h2>

        {loading ? (
          <div className="rounded-2xl border border-slate-200/80 p-10 flex items-center justify-center gap-2 text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin text-sky-500" />
            Loading sessions...
          </div>
        ) : sessions.length === 0 ? (
          <div className="rounded-2xl bg-slate-50 border border-slate-200/80 p-10 text-center text-sm text-slate-500">
            No sessions created yet.
          </div>
        ) : (
          <div className="space-y-2.5">
            {sessions.map((s, idx) => (
              <div
                key={s.id}
                className="rounded-2xl bg-white border border-slate-200/90 hover:border-sky-200 px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors"
              >
                <div className="flex items-start gap-3.5">
                  <span className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                    {idx + 1}
                  </span>
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-900">
                        {s.session_name}
                      </span>
                      <span className="text-xs uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">
                        {s.status}
                      </span>
                      <span className="text-xs text-slate-400">
                        ({s.game_mode})
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      Progress: {s.current_question_number} /{' '}
                      {s.questions_per_team * 3} · Timer: {s.timer_duration}s ·
                      Created {new Date(s.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end md:self-center">
                  <Link
                    href={`/control?sessionId=${s.id}`}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-xs font-semibold text-white"
                  >
                    {s.status === 'pending' ? (
                      <Play className="w-3.5 h-3.5" />
                    ) : (
                      <Sliders className="w-3.5 h-3.5" />
                    )}
                    MC Control
                  </Link>
                  <Link
                    href={`/game?sessionId=${s.id}`}
                    target="_blank"
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700"
                  >
                    <Monitor className="w-3.5 h-3.5 text-sky-600" />
                    Projector
                  </Link>
                  <button
                    onClick={() => handleDeleteSession(s.id, s.session_name)}
                    title="Delete session"
                    className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
