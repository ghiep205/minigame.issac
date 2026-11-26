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

  // New session form
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
    if (mode === 'standard') {
      setQuestionsPerTeam(15);
    } else {
      setQuestionsPerTeam(5);
    }
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
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Game Sessions</h1>
        <p className="text-sm text-slate-400">
          Initialize new quiz sessions with randomized, non-repeating question
          pools stored in Supabase.
        </p>
      </div>

      {feedback && (
        <div
          className={`rounded-xl p-3.5 flex items-center gap-2.5 text-sm border ${
            feedback.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-700/60 text-emerald-100'
              : 'bg-red-950/50 border-red-700/60 text-red-100'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <XCircle className="w-4 h-4 text-red-400 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Setup Form */}
      <form
        onSubmit={handleCreateSession}
        className="rounded-xl bg-slate-900 border border-slate-800 p-6 space-y-5"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">
            Create New Session
          </h2>
          <span className="text-xs text-slate-400">
            Total questions: {questionsPerTeam * 3}
          </span>
        </div>

        {/* Question readiness preview */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {TEAMS.map((t) => {
            const cfg = TEAM_CONFIG[t];
            const ok = activeCounts[t] >= questionsPerTeam;
            return (
              <div
                key={t}
                className="rounded-lg bg-slate-950 border border-slate-800 px-4 py-3 flex items-center justify-between"
              >
                <span className="inline-flex items-center gap-2 text-sm font-medium text-white">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: cfg.hex }}
                  />
                  {cfg.label}
                </span>
                <span
                  className={`text-xs font-medium ${
                    ok ? 'text-emerald-400' : 'text-amber-400'
                  }`}
                >
                  {activeCounts[t]} / {questionsPerTeam} active
                </span>
              </div>
            );
          })}
        </div>

        {insufficientTeams.length > 0 && (
          <div className="rounded-lg bg-amber-950/40 border border-amber-700/60 p-3 flex items-center gap-2.5 text-xs text-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              Add more active questions in{' '}
              <Link href="/admin/questions" className="underline font-medium">
                Questions
              </Link>{' '}
              or switch to Test Mode (5 per team).
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-2 space-y-1.5">
            <label className="block text-sm font-medium text-slate-300">
              Session Name *
            </label>
            <input
              type="text"
              required
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              placeholder="e.g. Company Townhall Finals 2026"
              className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-300">
              Game Mode
            </label>
            <select
              value={gameMode}
              onChange={(e) =>
                handleModeChange(e.target.value as 'standard' | 'test')
              }
              className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            >
              <option value="standard">Standard (15 / team = 45)</option>
              <option value="test">Test Mode (5 / team = 15)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-300">
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
              className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
          <label className="inline-flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={autoStart}
              onChange={(e) => setAutoStart(e.target.checked)}
              className="rounded border-slate-700 bg-slate-950"
            />
            Start session immediately (load Question 1 for Team Red)
          </label>

          <button
            type="submit"
            disabled={creating || insufficientTeams.length > 0}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm font-medium text-white transition-colors cursor-pointer"
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
      <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800">
          <h2 className="font-semibold text-white">All Sessions</h2>
        </div>

        {loading ? (
          <div className="p-10 flex items-center justify-center gap-2 text-sm text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading sessions...
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-400">
            No sessions created yet.
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5">
                    <span className="font-semibold text-white">
                      {s.session_name}
                    </span>
                    <span className="text-xs uppercase tracking-wider px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                      {s.status}
                    </span>
                    <span className="text-xs text-slate-500">
                      ({s.game_mode})
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Progress: {s.current_question_number} /{' '}
                    {s.questions_per_team * 3} · Timer: {s.timer_duration}s ·
                    Created {new Date(s.created_at).toLocaleString()}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    href={`/control?sessionId=${s.id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white"
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
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200"
                  >
                    <Monitor className="w-3.5 h-3.5" />
                    Projector
                  </Link>
                  <button
                    onClick={() => handleDeleteSession(s.id, s.session_name)}
                    title="Delete session"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800 cursor-pointer"
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
