'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Play,
  Pause,
  RotateCcw,
  Check,
  X,
  SkipForward,
  Clock,
  Monitor,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Square,
  Loader2,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useSynchronizedTimer } from '@/hooks/useSynchronizedTimer';
import {
  TEAM_CONFIG,
  TEAMS,
  type GameSession,
  type Question,
  type QuestionOutcome,
  type TeamProgress,
} from '@/types/quiz';

interface MCControlPanelProps {
  initialSessionId?: string;
  operatorEmail: string;
  operatorRole: string;
}

export function MCControlPanel({
  initialSessionId,
  operatorEmail,
  operatorRole,
}: MCControlPanelProps) {
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>(
    initialSessionId ?? ''
  );
  const [session, setSession] = useState<GameSession | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [teamProgress, setTeamProgress] = useState<TeamProgress[]>([]);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const [confirmDialog, setConfirmDialog] = useState<
    'restart' | 'end' | null
  >(null);

  const actionLockRef = useRef(false);

  const syncServerTime = useCallback(async () => {
    const supabase = createClient();
    const before = Date.now();
    const { data, error } = await supabase.rpc('get_server_time');
    const after = Date.now();
    if (!error && data) {
      const serverMs = Date.parse(data as string);
      const rttMid = (before + after) / 2;
      setServerOffsetMs(serverMs - rttMid);
    }
  }, []);

  const loadSessionsList = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('game_sessions')
      .select('*')
      .order('created_at', { ascending: false });

    const list = (data ?? []) as GameSession[];
    setSessions(list);

    setSelectedSessionId((prev) => {
      if (prev && list.some((s) => s.id === prev)) return prev;
      const active =
        list.find((s) => s.status === 'playing' || s.status === 'paused') ??
        list.find((s) => s.status === 'pending') ??
        list[0];
      return active?.id ?? '';
    });
  }, []);

  const loadSessionState = useCallback(async (sessionId: string) => {
    if (!sessionId) {
      setSession(null);
      setCurrentQuestion(null);
      setTeamProgress([]);
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const [sessionRes, progressRes] = await Promise.all([
      supabase.from('game_sessions').select('*').eq('id', sessionId).single(),
      supabase.from('team_progress').select('*').eq('session_id', sessionId),
    ]);

    if (sessionRes.error || !sessionRes.data) {
      setFeedback({
        type: 'error',
        message: sessionRes.error?.message ?? 'Session not found.',
      });
      setLoading(false);
      return;
    }

    const s = sessionRes.data as GameSession;
    setSession(s);
    setTeamProgress((progressRes.data ?? []) as TeamProgress[]);

    if (s.current_question_id) {
      const { data: qData } = await supabase
        .from('questions')
        .select('*')
        .eq('id', s.current_question_id)
        .single();
      setCurrentQuestion((qData as Question) ?? null);
    } else {
      setCurrentQuestion(null);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      void syncServerTime();
      void loadSessionsList();
    }, 0);
    return () => clearTimeout(t);
  }, [syncServerTime, loadSessionsList]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (!selectedSessionId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      void loadSessionState(selectedSessionId);
    }, 0);

    if (!selectedSessionId) {
      return () => clearTimeout(t);
    }

    const supabase = createClient();
    const channel = supabase
      .channel(`mc-control-${selectedSessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_sessions',
          filter: `id=eq.${selectedSessionId}`,
        },
        () => {
          loadSessionState(selectedSessionId);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'team_progress',
          filter: `session_id=eq.${selectedSessionId}`,
        },
        () => {
          loadSessionState(selectedSessionId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedSessionId, loadSessionState]);

  const { displaySeconds, isTimeUp } = useSynchronizedTimer(
    session,
    serverOffsetMs
  );

  async function runGuardedAction(
    label: string,
    fn: () => Promise<void>
  ): Promise<void> {
    if (actionLockRef.current) return;
    actionLockRef.current = true;
    setBusyAction(label);
    setFeedback(null);
    try {
      await fn();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Action failed.',
      });
    } finally {
      actionLockRef.current = false;
      setBusyAction(null);
    }
  }

  async function handleStartGame() {
    if (!session) return;
    await runGuardedAction('start_game', async () => {
      const supabase = createClient();
      const { error } = await supabase.rpc('start_game_session', {
        p_session_id: session.id,
      });
      if (error) throw new Error(error.message);
      await loadSessionState(session.id);
    });
  }

  async function handleTimerAction(
    action: 'start' | 'pause' | 'resume' | 'reset'
  ) {
    if (!session) return;
    await runGuardedAction(`timer_${action}`, async () => {
      const supabase = createClient();
      const { error } = await supabase.rpc('control_timer', {
        p_session_id: session.id,
        p_action: action,
      });
      if (error) throw new Error(error.message);
      await loadSessionState(session.id);
    });
  }

  async function handleOutcome(outcome: QuestionOutcome) {
    if (!session || !session.current_session_question_id) return;
    await runGuardedAction(`outcome_${outcome}`, async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('submit_question_result', {
        p_session_id: session.id,
        p_expected_session_question_id: session.current_session_question_id,
        p_outcome: outcome,
      });
      if (error) throw new Error(error.message);

      const res = data as { advanced?: boolean; reason?: string } | null;
      if (res && res.advanced === false) {
        setFeedback({
          type: 'error',
          message: `Question was already advanced (${res.reason}).`,
        });
      }
      await loadSessionState(session.id);
    });
  }

  async function handleRestartSession() {
    if (!session) return;
    setConfirmDialog(null);
    await runGuardedAction('restart', async () => {
      const supabase = createClient();
      const { error } = await supabase.rpc('restart_game_session', {
        p_session_id: session.id,
      });
      if (error) throw new Error(error.message);
      setFeedback({ type: 'success', message: 'Session restarted to pending.' });
      await loadSessionState(session.id);
    });
  }

  async function handleEndSession() {
    if (!session) return;
    setConfirmDialog(null);
    await runGuardedAction('end', async () => {
      const supabase = createClient();
      const { error } = await supabase.rpc('end_game_session', {
        p_session_id: session.id,
      });
      if (error) throw new Error(error.message);
      setFeedback({ type: 'success', message: 'Session ended.' });
      await loadSessionState(session.id);
    });
  }

  const totalQuestions = session ? session.questions_per_team * 3 : 45;
  const activeTeamCfg = session ? TEAM_CONFIG[session.current_team] : null;
  const progressByTeam = Object.fromEntries(
    teamProgress.map((tp) => [tp.team, tp])
  );

  return (
    <div className="min-h-screen bg-[#0B1120] text-slate-100">
      {/* Top Bar */}
      <header className="border-b border-slate-800 bg-slate-900/90 sticky top-0 z-30 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="font-bold text-white text-lg">MC Control Panel</span>
            <select
              value={selectedSessionId}
              onChange={(e) => setSelectedSessionId(e.target.value)}
              className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-sm text-white max-w-xs focus:outline-none focus:border-blue-500"
            >
              {sessions.length === 0 && <option value="">No sessions</option>}
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.session_name} ({s.status})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href={session ? `/game?sessionId=${session.id}` : '/game'}
              target="_blank"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs sm:text-sm font-medium text-white"
            >
              <Monitor className="w-4 h-4" />
              Projector
            </Link>
            {operatorRole === 'admin' && (
              <Link
                href="/admin"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs sm:text-sm font-medium text-slate-200"
              >
                <ShieldCheck className="w-4 h-4" />
                Admin
              </Link>
            )}
            <span className="hidden md:inline text-xs text-slate-400">
              {operatorEmail}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
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

        {loading ? (
          <div className="p-16 flex items-center justify-center gap-2 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading session...
          </div>
        ) : !session ? (
          <div className="rounded-xl bg-slate-900 border border-slate-800 p-10 text-center space-y-4">
            <p className="text-slate-300">No game session found.</p>
            <Link
              href="/admin/sessions"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white"
            >
              Create a Session in Admin
            </Link>
          </div>
        ) : (
          <>
            {/* Status & Progress Header */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 rounded-xl bg-slate-900 border border-slate-800 p-5 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-wider text-slate-400">
                    Active Session
                  </p>
                  <h1 className="text-xl font-bold text-white mt-0.5">
                    {session.session_name}
                  </h1>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-xs text-slate-400">Overall Progress</p>
                    <p className="text-lg font-bold text-white">
                      Question {session.current_question_number} / {totalQuestions}
                    </p>
                  </div>
                  <span className="px-3 py-1.5 rounded-lg bg-slate-800 text-xs font-semibold uppercase tracking-wider text-slate-200">
                    {session.status}
                  </span>
                </div>
              </div>

              {/* Timer Readout */}
              <div
                className={`rounded-xl border p-5 flex items-center justify-between ${
                  isTimeUp
                    ? 'bg-red-950/60 border-red-600'
                    : displaySeconds <= 5 && session.timer_running
                    ? 'bg-amber-950/50 border-amber-600'
                    : 'bg-slate-900 border-slate-800'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Clock className="w-6 h-6 text-slate-300" />
                  <div>
                    <p className="text-xs uppercase tracking-wider text-slate-400">
                      Countdown
                    </p>
                    <p className="text-xs text-slate-300">
                      {isTimeUp
                        ? "TIME'S UP"
                        : session.timer_running
                        ? 'Running'
                        : session.status === 'paused'
                        ? 'Paused'
                        : 'Ready'}
                    </p>
                  </div>
                </div>
                <div className="text-4xl font-mono font-bold text-white tabular-nums">
                  {displaySeconds}s
                </div>
              </div>
            </div>

            {/* Pending Start State */}
            {session.status === 'pending' && (
              <div className="rounded-xl bg-slate-900 border border-slate-800 p-8 text-center space-y-4">
                <h2 className="text-xl font-semibold text-white">
                  Session is Ready to Start
                </h2>
                <p className="text-sm text-slate-400 max-w-lg mx-auto">
                  Click below to load Question 1 for Team Red. The 25-second
                  timer will wait until you press Start Timer.
                </p>
                <button
                  onClick={handleStartGame}
                  disabled={busyAction !== null}
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-base font-semibold text-white cursor-pointer"
                >
                  <Play className="w-5 h-5" />
                  Start Game
                </button>
              </div>
            )}

            {/* Active Question & Controls */}
            {(session.status === 'playing' || session.status === 'paused') &&
              currentQuestion &&
              activeTeamCfg && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left: Current Question + Answer Reference */}
                  <div className="lg:col-span-2 rounded-xl bg-slate-900 border border-slate-800 p-6 space-y-5">
                    <div className="flex items-center justify-between">
                      <span
                        className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-bold text-white"
                        style={{ backgroundColor: activeTeamCfg.hex }}
                      >
                        {activeTeamCfg.label}&apos;s Turn
                      </span>
                      <span className="text-xs text-slate-400 uppercase tracking-wider">
                        Oral Question
                      </span>
                    </div>

                    <div className="rounded-xl bg-slate-950 border border-slate-800 p-5">
                      <p className="text-xl sm:text-2xl font-semibold text-white leading-snug">
                        {currentQuestion.question_text}
                      </p>
                    </div>

                    <div className="rounded-xl bg-emerald-950/25 border border-emerald-800/40 p-4 space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                        Answer Reference (MC Only — Hidden from Projector)
                      </p>
                      <p className="text-base text-emerald-100 font-medium">
                        {currentQuestion.answer_text || 'No answer reference provided.'}
                      </p>
                      {currentQuestion.notes && (
                        <p className="text-xs text-slate-400 pt-1">
                          Notes: {currentQuestion.notes}
                        </p>
                      )}
                    </div>

                    {/* Timer Controls */}
                    <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center gap-3">
                      {!session.timer_running &&
                        session.status !== 'paused' && (
                          <button
                            onClick={() => handleTimerAction('start')}
                            disabled={busyAction !== null}
                            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 font-semibold text-white cursor-pointer"
                          >
                            <Play className="w-4 h-4" />
                            Start 25s Timer
                          </button>
                        )}

                      {session.timer_running && (
                        <button
                          onClick={() => handleTimerAction('pause')}
                          disabled={busyAction !== null}
                          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 font-semibold text-white cursor-pointer"
                        >
                          <Pause className="w-4 h-4" />
                          Pause Timer
                        </button>
                      )}

                      {!session.timer_running &&
                        session.status === 'paused' && (
                          <button
                            onClick={() => handleTimerAction('resume')}
                            disabled={busyAction !== null}
                            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 font-semibold text-white cursor-pointer"
                          >
                            <Play className="w-4 h-4" />
                            Resume Timer
                          </button>
                        )}

                      <button
                        onClick={() => handleTimerAction('reset')}
                        disabled={busyAction !== null}
                        className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-sm font-medium text-slate-200 cursor-pointer"
                      >
                        <RotateCcw className="w-4 h-4" />
                        Reset Timer
                      </button>
                    </div>
                  </div>

                  {/* Right: Big MC Decision Buttons */}
                  <div className="rounded-xl bg-slate-900 border border-slate-800 p-6 flex flex-col justify-between gap-4">
                    <div className="space-y-3">
                      <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
                        Judge &amp; Advance Turn
                      </h2>

                      {isTimeUp && (
                        <div className="rounded-lg bg-red-950/70 border border-red-600 p-3 text-sm font-semibold text-red-200 flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                          TIME&apos;S UP! Confirm timeout or mark answer.
                        </div>
                      )}

                      <button
                        onClick={() => handleOutcome('correct')}
                        disabled={busyAction !== null}
                        className="w-full py-4 px-5 rounded-xl bg-[#16A34A] hover:bg-[#15803D] disabled:opacity-50 text-white font-bold text-lg flex items-center justify-center gap-2.5 transition-colors cursor-pointer"
                      >
                        <Check className="w-6 h-6" />
                        CORRECT
                      </button>

                      <button
                        onClick={() => handleOutcome('incorrect')}
                        disabled={busyAction !== null}
                        className="w-full py-4 px-5 rounded-xl bg-[#EF4444] hover:bg-[#DC2626] disabled:opacity-50 text-white font-bold text-lg flex items-center justify-center gap-2.5 transition-colors cursor-pointer"
                      >
                        <X className="w-6 h-6" />
                        INCORRECT / CANCEL
                      </button>

                      <button
                        onClick={() =>
                          handleOutcome(isTimeUp ? 'timeout' : 'skipped')
                        }
                        disabled={busyAction !== null}
                        className="w-full py-3.5 px-5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-100 font-semibold text-base flex items-center justify-center gap-2 transition-colors cursor-pointer"
                      >
                        <SkipForward className="w-5 h-5" />
                        {isTimeUp
                          ? 'CONFIRM TIMEOUT / NEXT'
                          : 'SKIP / NEXT QUESTION'}
                      </button>
                    </div>

                    <div className="pt-4 border-t border-slate-800 flex items-center gap-2">
                      <button
                        onClick={() => setConfirmDialog('restart')}
                        disabled={busyAction !== null}
                        className="flex-1 py-2.5 px-3 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs font-medium text-slate-300 flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Restart Session
                      </button>
                      <button
                        onClick={() => setConfirmDialog('end')}
                        disabled={busyAction !== null}
                        className="flex-1 py-2.5 px-3 rounded-lg border border-red-900/60 hover:bg-red-950/50 text-xs font-medium text-red-300 flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Square className="w-3.5 h-3.5" />
                        End Game
                      </button>
                    </div>
                  </div>
                </div>
              )}

            {/* Completed State */}
            {session.status === 'completed' && (
              <div className="rounded-xl bg-slate-900 border border-slate-800 p-8 text-center space-y-4">
                <h2 className="text-2xl font-bold text-white">
                  Session Completed
                </h2>
                <p className="text-sm text-slate-400">
                  All questions have been completed or the session was ended.
                </p>
                <div className="flex justify-center gap-3">
                  <button
                    onClick={() => setConfirmDialog('restart')}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-medium text-white cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Restart Session
                  </button>
                  <Link
                    href="/admin/sessions"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white"
                  >
                    Create New Session
                  </Link>
                </div>
              </div>
            )}

            {/* Team Progress */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {TEAMS.map((t) => {
                const cfg = TEAM_CONFIG[t];
                const tp = progressByTeam[t];
                const isActive =
                  (session.status === 'playing' || session.status === 'paused') &&
                  session.current_team === t;
                return (
                  <div
                    key={t}
                    className={`rounded-xl bg-slate-900 p-5 border-2 transition-colors ${
                      isActive ? '' : 'border-slate-800'
                    }`}
                    style={isActive ? { borderColor: cfg.hex } : undefined}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="inline-flex items-center gap-2 font-bold text-white">
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: cfg.hex }}
                        />
                        {cfg.label}
                      </span>
                      {isActive && (
                        <span className="text-xs font-semibold uppercase tracking-wider text-white px-2 py-0.5 rounded bg-slate-800">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-slate-950 p-2.5">
                        <p className="text-xs text-slate-400">Done</p>
                        <p className="text-lg font-bold text-white">
                          {tp?.completed_count ?? 0}/{tp?.question_count ?? 15}
                        </p>
                      </div>
                      <div className="rounded-lg bg-slate-950 p-2.5">
                        <p className="text-xs text-slate-400">Correct</p>
                        <p className="text-lg font-bold text-emerald-400">
                          {tp?.correct_count ?? 0}
                        </p>
                      </div>
                      <div className="rounded-lg bg-slate-950 p-2.5">
                        <p className="text-xs text-slate-400">Skipped</p>
                        <p className="text-lg font-bold text-slate-300">
                          {tp?.skipped_count ?? 0}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>

      {/* Confirmation Dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl bg-slate-900 border border-slate-700 p-6 space-y-4">
            <h3 className="text-lg font-bold text-white">
              {confirmDialog === 'restart'
                ? 'Restart Entire Session?'
                : 'End Game Session?'}
            </h3>
            <p className="text-sm text-slate-300">
              {confirmDialog === 'restart'
                ? 'This will reset all scores and question progress back to 0 for this session.'
                : 'This will mark the session as completed and show the final results screen on the projector.'}
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 rounded-lg border border-slate-700 text-sm font-medium text-slate-300 hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={
                  confirmDialog === 'restart'
                    ? handleRestartSession
                    : handleEndSession
                }
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-sm font-semibold text-white cursor-pointer"
              >
                {confirmDialog === 'restart' ? 'Yes, Restart' : 'Yes, End Game'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
