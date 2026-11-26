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
  Music,
  Volume2,
  VolumeX,
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

  const [confirmDialog, setConfirmDialog] = useState<'restart' | 'end' | null>(
    null
  );

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
      clearTimeout(t);
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

  async function handleAudioAction(action: 'play' | 'stop') {
    if (!session) return;
    await runGuardedAction(`audio_${action}`, async () => {
      const supabase = createClient();
      const { error } = await supabase.rpc('control_audio', {
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
    <div className="min-h-dvh bg-[#F4F7FB] text-slate-900">
      <header className="border-b border-slate-200/80 bg-white/95 sticky top-0 z-30 backdrop-blur">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 sm:py-0 sm:h-16 flex flex-wrap items-center justify-between gap-2.5 sm:gap-4">
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-4 w-full sm:w-auto">
            <span className="font-bold text-slate-900 text-base sm:text-lg">
              MC Control
            </span>
            <select
              value={selectedSessionId}
              onChange={(e) => setSelectedSessionId(e.target.value)}
              className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-1.5 text-sm text-slate-800 flex-1 sm:flex-initial sm:max-w-xs focus:outline-none focus:bg-white focus:border-sky-400"
            >
              {sessions.length === 0 && <option value="">No sessions</option>}
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.session_name} ({s.status})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 sm:gap-2.5">
            <Link
              href={session ? `/game?sessionId=${session.id}` : '/game'}
              target="_blank"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-xs sm:text-sm font-semibold text-white"
            >
              <Monitor className="w-4 h-4" />
              Projector
            </Link>
            {operatorRole === 'admin' && (
              <Link
                href="/admin"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-xs sm:text-sm font-semibold text-slate-700"
              >
                <ShieldCheck className="w-4 h-4 text-sky-600" />
                Admin
              </Link>
            )}
            <span className="hidden md:inline text-xs text-slate-500">
              {operatorEmail}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-2.5 sm:px-6 py-3.5 sm:py-6 space-y-4 sm:space-y-6">
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

        {loading ? (
          <div className="p-16 flex items-center justify-center gap-2 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin text-sky-500" />
            Loading session...
          </div>
        ) : !session ? (
          <div className="rounded-2xl bg-white border border-slate-200 p-10 text-center space-y-4 shadow-2xs">
            <p className="text-slate-600">No game session found.</p>
            <Link
              href="/admin/sessions"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-sm font-semibold text-white"
            >
              Create a Session in Admin
            </Link>
          </div>
        ) : (
          <>
            {/* Status & Timer Header */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 rounded-2xl bg-white border border-slate-200/80 shadow-2xs p-5 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-sky-600">
                    Active Session
                  </p>
                  <h1 className="text-xl font-bold text-slate-900 mt-0.5">
                    {session.session_name}
                  </h1>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-xs text-slate-400">Overall Progress</p>
                    <p className="text-lg font-bold text-slate-900">
                      Question {session.current_question_number} / {totalQuestions}
                    </p>
                  </div>
                  <span className="px-3 py-1.5 rounded-full bg-[#EBF6FF] border border-sky-200 text-xs font-bold uppercase tracking-wider text-sky-700">
                    {session.status}
                  </span>
                </div>
              </div>

              <div
                className={`rounded-2xl border p-5 flex items-center justify-between shadow-2xs ${
                  isTimeUp
                    ? 'bg-red-50 border-red-300'
                    : displaySeconds <= 5 && session.timer_running
                    ? 'bg-amber-50 border-amber-300'
                    : 'bg-white border-slate-200/80'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Countdown
                    </p>
                    <p className="text-xs font-semibold text-slate-700">
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
                <div className="text-4xl font-mono font-bold text-slate-900 tabular-nums">
                  {displaySeconds}s
                </div>
              </div>
            </div>

            {session.status === 'pending' && (
              <div className="rounded-2xl bg-white border border-slate-200/80 p-8 text-center space-y-4 shadow-2xs">
                <h2 className="text-xl font-bold text-slate-900">
                  Session is Ready to Start
                </h2>
                <p className="text-sm text-slate-500 max-w-lg mx-auto">
                  Click below to load Question 1 for Team Red. The 25-second
                  timer will wait until you press Start Timer.
                </p>
                <button
                  onClick={handleStartGame}
                  disabled={busyAction !== null}
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-[#16A34A] hover:bg-[#15803D] disabled:opacity-50 text-base font-semibold text-white cursor-pointer"
                >
                  <Play className="w-5 h-5" />
                  Start Game
                </button>
              </div>
            )}

            {(session.status === 'playing' || session.status === 'paused') &&
              currentQuestion &&
              activeTeamCfg && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 rounded-2xl bg-white border border-slate-200/80 shadow-2xs p-6 space-y-5">
                    <div className="flex items-center justify-between">
                      <span
                        className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-sm font-bold text-white"
                        style={{ backgroundColor: activeTeamCfg.hex }}
                      >
                        {activeTeamCfg.label}&apos;s Turn
                      </span>
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Oral Question
                      </span>
                    </div>

                    <div className="rounded-2xl bg-slate-50 border border-slate-200/80 p-5">
                      <p className="text-xl sm:text-2xl font-bold text-slate-900 leading-snug">
                        {currentQuestion.question_text}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-[#EBF6FF] border border-sky-200/70 p-4 space-y-1">
                      <p className="text-xs font-bold uppercase tracking-wider text-sky-700">
                        Answer Reference (MC Only — Hidden from Projector)
                      </p>
                      <p className="text-base text-slate-900 font-semibold">
                        {currentQuestion.answer_text ||
                          'No answer reference provided.'}
                      </p>
                      {currentQuestion.notes && (
                        <p className="text-xs text-slate-500 pt-1">
                          Notes: {currentQuestion.notes}
                        </p>
                      )}
                    </div>

                    {currentQuestion.audio_url && (
                      <div className="rounded-2xl bg-slate-50 border border-slate-200/80 p-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <Music className="w-4 h-4 text-sky-600" />
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                              Audio Question (
                              {Math.round(
                                currentQuestion.audio_duration_seconds ?? 20
                              )}
                              s Clip)
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            {session.audio_playing ? (
                              <button
                                onClick={() => handleAudioAction('stop')}
                                disabled={busyAction !== null}
                                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#EF4444] hover:bg-[#DC2626] text-xs font-semibold text-white cursor-pointer"
                              >
                                <VolumeX className="w-3.5 h-3.5" />
                                Stop Projector Audio
                              </button>
                            ) : (
                              <button
                                onClick={() => handleAudioAction('play')}
                                disabled={busyAction !== null}
                                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-xs font-semibold text-white cursor-pointer"
                              >
                                <Volume2 className="w-3.5 h-3.5" />
                                Play Clip on Projector
                              </button>
                            )}
                          </div>
                        </div>

                        <audio
                          controls
                          src={currentQuestion.audio_url}
                          className="w-full h-9"
                        />
                      </div>
                    )}

                    <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-3">
                      {!session.timer_running &&
                        session.status !== 'paused' && (
                          <button
                            onClick={() => handleTimerAction('start')}
                            disabled={busyAction !== null}
                            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-sky-500 hover:bg-sky-600 disabled:opacity-50 font-semibold text-white cursor-pointer"
                          >
                            <Play className="w-4 h-4" />
                            Start 25s Timer
                          </button>
                        )}

                      {session.timer_running && (
                        <button
                          onClick={() => handleTimerAction('pause')}
                          disabled={busyAction !== null}
                          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 font-semibold text-white cursor-pointer"
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
                            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-sky-500 hover:bg-sky-600 disabled:opacity-50 font-semibold text-white cursor-pointer"
                          >
                            <Play className="w-4 h-4" />
                            Resume Timer
                          </button>
                        )}

                      <button
                        onClick={() => handleTimerAction('reset')}
                        disabled={busyAction !== null}
                        className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 text-sm font-semibold text-slate-700 cursor-pointer"
                      >
                        <RotateCcw className="w-4 h-4" />
                        Reset Timer
                      </button>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-white border border-slate-200/80 shadow-2xs p-6 flex flex-col justify-between gap-4">
                    <div className="space-y-3">
                      <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Judge &amp; Advance Turn
                      </h2>

                      {isTimeUp && (
                        <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm font-semibold text-red-700 flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
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
                        className="w-full py-3.5 px-5 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-800 font-semibold text-base flex items-center justify-center gap-2 transition-colors cursor-pointer"
                      >
                        <SkipForward className="w-5 h-5" />
                        {isTimeUp
                          ? 'CONFIRM TIMEOUT / NEXT'
                          : 'SKIP / NEXT QUESTION'}
                      </button>
                    </div>

                    <div className="pt-4 border-t border-slate-100 flex items-center gap-2">
                      <button
                        onClick={() => setConfirmDialog('restart')}
                        disabled={busyAction !== null}
                        className="flex-1 py-2.5 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-600 flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Restart Session
                      </button>
                      <button
                        onClick={() => setConfirmDialog('end')}
                        disabled={busyAction !== null}
                        className="flex-1 py-2.5 px-3 rounded-xl border border-red-200 bg-red-50/50 hover:bg-red-50 text-xs font-semibold text-red-600 flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Square className="w-3.5 h-3.5" />
                        End Game
                      </button>
                    </div>
                  </div>
                </div>
              )}

            {session.status === 'completed' && (
              <div className="rounded-2xl bg-white border border-slate-200/80 p-8 text-center space-y-4 shadow-2xs">
                <h2 className="text-2xl font-bold text-slate-900">
                  Session Completed
                </h2>
                <p className="text-sm text-slate-500">
                  All questions have been completed or the session was ended.
                </p>
                <div className="flex justify-center gap-3">
                  <button
                    onClick={() => setConfirmDialog('restart')}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-sm font-semibold text-slate-700 cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Restart Session
                  </button>
                  <Link
                    href="/admin/sessions"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-sm font-semibold text-white"
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
                    className={`rounded-2xl bg-white p-5 border-2 shadow-2xs transition-colors ${
                      isActive ? '' : 'border-slate-200/80'
                    }`}
                    style={isActive ? { borderColor: cfg.hex } : undefined}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="inline-flex items-center gap-2 font-bold text-slate-900">
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: cfg.hex }}
                        />
                        {cfg.label}
                      </span>
                      {isActive && (
                        <span
                          className="text-xs font-bold uppercase tracking-wider text-white px-2.5 py-0.5 rounded-full"
                          style={{ backgroundColor: cfg.hex }}
                        >
                          Active
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-xl bg-slate-50 border border-slate-100 p-2.5">
                        <p className="text-xs text-slate-400">Done</p>
                        <p className="text-lg font-bold text-slate-900">
                          {tp?.completed_count ?? 0}/{tp?.question_count ?? 15}
                        </p>
                      </div>
                      <div className="rounded-xl bg-slate-50 border border-slate-100 p-2.5">
                        <p className="text-xs text-slate-400">Correct</p>
                        <p className="text-lg font-bold text-[#16A34A]">
                          {tp?.correct_count ?? 0}
                        </p>
                      </div>
                      <div className="rounded-xl bg-slate-50 border border-slate-100 p-2.5">
                        <p className="text-xs text-slate-400">Skipped</p>
                        <p className="text-lg font-bold text-slate-500">
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

      {confirmDialog && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900">
              {confirmDialog === 'restart'
                ? 'Restart Entire Session?'
                : 'End Game Session?'}
            </h3>
            <p className="text-sm text-slate-600">
              {confirmDialog === 'restart'
                ? 'This will reset all scores and question progress back to 0 for this session.'
                : 'This will mark the session as completed and show the final results screen on the projector.'}
            </p>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={
                  confirmDialog === 'restart'
                    ? handleRestartSession
                    : handleEndSession
                }
                className="px-4 py-2 rounded-xl bg-[#EF4444] hover:bg-[#DC2626] text-sm font-semibold text-white cursor-pointer"
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
