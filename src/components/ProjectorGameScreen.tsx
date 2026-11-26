'use client';

import { useCallback, useEffect, useState } from 'react';
import { Maximize2, Minimize2, Radio, Clock, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useSynchronizedTimer } from '@/hooks/useSynchronizedTimer';
import {
  TEAM_CONFIG,
  TEAMS,
  type PublicGameState,
} from '@/types/quiz';

interface ProjectorGameScreenProps {
  initialSessionId?: string;
}

export function ProjectorGameScreen({
  initialSessionId,
}: ProjectorGameScreenProps) {
  const [gameState, setGameState] = useState<PublicGameState | null>(null);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGameState = useCallback(async () => {
    try {
      const supabase = createClient();
      const before = Date.now();
      const { data, error: rpcError } = await supabase.rpc(
        'get_public_game_state',
        {
          p_session_id: initialSessionId || null,
        }
      );
      const after = Date.now();

      if (rpcError) {
        setError(rpcError.message);
        setLoading(false);
        return;
      }

      const payload = data as PublicGameState;
      if (payload?.server_time) {
        const serverMs = Date.parse(payload.server_time);
        const rttMid = (before + after) / 2;
        setServerOffsetMs(serverMs - rttMid);
      }

      setGameState(payload);
      setError(null);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load game state.');
      setLoading(false);
    }
  }, [initialSessionId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchGameState();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchGameState]);

  const session = gameState?.session ?? null;
  const sessionId = session?.id;

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`projector-${sessionId ?? 'global'}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_sessions',
          ...(sessionId ? { filter: `id=eq.${sessionId}` } : {}),
        },
        () => {
          fetchGameState();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'team_progress',
          ...(sessionId ? { filter: `session_id=eq.${sessionId}` } : {}),
        },
        () => {
          fetchGameState();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, fetchGameState]);

  useEffect(() => {
    function onFsChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  async function toggleFullscreen() {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  }

  const { remainingSeconds, displaySeconds, isTimeUp } = useSynchronizedTimer(
    session,
    serverOffsetMs
  );

  const totalQuestions = session ? session.questions_per_team * 3 : 45;
  const progressByTeam = Object.fromEntries(
    (gameState?.team_progress ?? []).map((tp) => [tp.team, tp])
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F4F7FB] text-slate-500 flex items-center justify-center text-xl font-medium">
        Connecting to live game...
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#F4F7FB] text-red-700 flex items-center justify-center p-8 text-center">
        <div className="max-w-lg rounded-2xl bg-white border border-red-200 p-6 space-y-2 shadow-sm">
          <p className="text-xl font-bold">Connection Error</p>
          <p className="text-sm text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  const activeTeamCfg = session ? TEAM_CONFIG[session.current_team] : null;
  const isWarning =
    session?.timer_running && remainingSeconds > 0 && remainingSeconds <= 5;

  const timerProgressPct = session
    ? Math.max(0, Math.min(100, (remainingSeconds / session.timer_duration) * 100))
    : 0;

  return (
    <div className="min-h-screen w-full bg-[#F4F7FB] text-slate-900 flex flex-col justify-between p-5 lg:p-8 select-none">
      {/* TOP BAR */}
      <header className="rounded-2xl bg-white border border-slate-200/80 shadow-2xs px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#EF4444]" />
            <span className="w-3 h-3 rounded-full bg-[#16A34A]" />
            <span className="w-3 h-3 rounded-full bg-[#2563EB]" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-sky-600 font-bold">
              Live Team Quiz
            </p>
            <h1 className="text-xl lg:text-2xl font-bold text-slate-900">
              {session ? session.session_name : 'Waiting for Session'}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3.5">
          {session && (
            <>
              <div className="px-4 py-1.5 rounded-xl bg-[#EBF6FF] border border-sky-200/70 text-right">
                <p className="text-[11px] uppercase tracking-wider text-sky-700 font-semibold">
                  Progress
                </p>
                <p className="text-base lg:text-xl font-bold text-slate-900 tabular-nums">
                  QUESTION {session.current_question_number} / {totalQuestions}
                </p>
              </div>

              <div
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs lg:text-sm font-bold uppercase tracking-wider border ${
                  session.status === 'playing'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : session.status === 'paused'
                    ? 'bg-amber-50 border-amber-200 text-amber-700'
                    : 'bg-slate-100 border-slate-200 text-slate-600'
                }`}
              >
                <Radio className="w-4 h-4" />
                {session.status === 'playing' ? 'LIVE' : session.status}
              </div>
            </>
          )}

          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
          >
            {isFullscreen ? (
              <Minimize2 className="w-5 h-5" />
            ) : (
              <Maximize2 className="w-5 h-5" />
            )}
          </button>
        </div>
      </header>

      {/* MAIN SECTION */}
      <main className="flex-1 flex flex-col items-center justify-center py-6 lg:py-8">
        {!session || session.status === 'pending' ? (
          <div className="rounded-3xl bg-white border border-slate-200/80 shadow-[0_4px_24px_rgba(15,23,42,0.05)] p-10 lg:p-14 text-center space-y-6 max-w-3xl w-full">
            <div className="flex flex-wrap items-center justify-center gap-3">
              {TEAMS.map((t) => (
                <span
                  key={t}
                  className="px-5 py-2 rounded-xl font-bold text-white text-lg"
                  style={{ backgroundColor: TEAM_CONFIG[t].hex }}
                >
                  {TEAM_CONFIG[t].label}
                </span>
              ))}
            </div>
            <h2 className="text-4xl lg:text-5xl font-bold text-slate-900">
              {session ? session.session_name : 'Ready for Live Quiz'}
            </h2>
            <p className="text-lg lg:text-xl text-slate-500">
              {session
                ? 'Session is ready. Waiting for the MC to start the first question.'
                : 'No active quiz session right now. Waiting for host...'}
            </p>
          </div>
        ) : session.status === 'completed' ? (
          <div className="w-full max-w-5xl rounded-3xl bg-white border border-slate-200/80 shadow-[0_4px_24px_rgba(15,23,42,0.05)] p-8 lg:p-12 space-y-8 text-center">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#EBF6FF] border border-sky-200 text-sky-700 text-sm font-bold uppercase tracking-wider">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Session Complete
              </div>
              <h2 className="text-4xl lg:text-5xl font-bold text-slate-900">
                Final Team Summary
              </h2>
              <p className="text-slate-500 text-lg">
                {session.session_name} · {totalQuestions} Questions
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {TEAMS.map((t) => {
                const cfg = TEAM_CONFIG[t];
                const tp = progressByTeam[t];
                return (
                  <div
                    key={t}
                    className="rounded-2xl bg-[#F8FAFC] border-2 p-7 space-y-5"
                    style={{ borderColor: cfg.hex }}
                  >
                    <div
                      className="inline-block px-4 py-1.5 rounded-xl text-white font-bold text-xl"
                      style={{ backgroundColor: cfg.hex }}
                    >
                      {cfg.label}
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-semibold uppercase tracking-wider text-slate-400">
                        Correct Answers
                      </p>
                      <p className="text-6xl font-bold text-slate-900 tabular-nums">
                        {tp?.correct_count ?? 0}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-200 text-sm">
                      <div>
                        <p className="text-slate-400">Completed</p>
                        <p className="text-xl font-bold text-slate-900">
                          {tp?.completed_count ?? 0}/{tp?.question_count ?? 15}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-400">Skipped</p>
                        <p className="text-xl font-bold text-slate-600">
                          {tp?.skipped_count ?? 0}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="w-full max-w-6xl space-y-5">
            {/* Team Turn + Timer Row */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              {activeTeamCfg && (
                <div
                  className="px-6 py-3 rounded-2xl text-white font-bold text-2xl lg:text-3xl tracking-wide flex items-center gap-3 shadow-xs"
                  style={{ backgroundColor: activeTeamCfg.hex }}
                >
                  <span className="w-3.5 h-3.5 rounded-full bg-white" />
                  {activeTeamCfg.label.toUpperCase()}&apos;S TURN
                </div>
              )}

              {/* Countdown Timer */}
              <div
                className={`px-7 py-3 rounded-2xl border-2 flex items-center gap-4 shadow-2xs transition-colors ${
                  isTimeUp
                    ? 'bg-red-50 border-[#EF4444] text-[#EF4444]'
                    : isWarning
                    ? 'bg-amber-50 border-amber-500 text-amber-700'
                    : 'bg-white border-slate-200 text-slate-900'
                }`}
              >
                <Clock className="w-8 h-8 shrink-0" />
                {isTimeUp ? (
                  <span className="text-3xl lg:text-4xl font-extrabold tracking-wider">
                    TIME&apos;S UP
                  </span>
                ) : (
                  <span className="text-5xl lg:text-6xl font-mono font-extrabold tabular-nums leading-none">
                    {displaySeconds}s
                  </span>
                )}
              </div>
            </div>

            {/* Timer Progress Bar */}
            <div className="w-full h-3 rounded-full bg-white border border-slate-200 overflow-hidden">
              <div
                className="h-full transition-all duration-150"
                style={{
                  width: `${timerProgressPct}%`,
                  backgroundColor: isTimeUp
                    ? '#EF4444'
                    : isWarning
                    ? '#F59E0B'
                    : activeTeamCfg?.hex ?? '#0EA5E9',
                }}
              />
            </div>

            {/* Large Question Card */}
            <div
              className="rounded-3xl bg-white border-2 p-8 lg:p-14 min-h-[250px] lg:min-h-[320px] flex items-center justify-center text-center shadow-[0_6px_30px_rgba(15,23,42,0.06)]"
              style={{
                borderColor: activeTeamCfg?.hex ?? '#CBD5E1',
              }}
            >
              <p className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 leading-tight tracking-tight">
                {gameState?.current_question?.question_text ??
                  'Loading question...'}
              </p>
            </div>
          </div>
        )}
      </main>

      {/* BOTTOM SECTION: TEAM PROGRESS */}
      <footer className="grid grid-cols-3 gap-4 lg:gap-6">
        {TEAMS.map((t) => {
          const cfg = TEAM_CONFIG[t];
          const tp = progressByTeam[t];
          const isActive =
            session &&
            (session.status === 'playing' || session.status === 'paused') &&
            session.current_team === t;

          return (
            <div
              key={t}
              className={`rounded-2xl p-4 lg:p-5 border-2 bg-white shadow-2xs transition-colors ${
                isActive ? '' : 'border-slate-200/80'
              }`}
              style={isActive ? { borderColor: cfg.hex } : undefined}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <span
                    className="w-3.5 h-3.5 rounded-full"
                    style={{ backgroundColor: cfg.hex }}
                  />
                  <span className="text-base lg:text-xl font-bold text-slate-900">
                    {cfg.label}
                  </span>
                </div>
                {isActive && (
                  <span
                    className="text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full text-white"
                    style={{ backgroundColor: cfg.hex }}
                  >
                    Active
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-slate-50 border border-slate-100 py-2 px-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Done
                  </p>
                  <p className="text-lg lg:text-2xl font-bold text-slate-900 tabular-nums">
                    {tp?.completed_count ?? 0}/{tp?.question_count ?? 15}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-100 py-2 px-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Correct
                  </p>
                  <p className="text-lg lg:text-2xl font-bold text-[#16A34A] tabular-nums">
                    {tp?.correct_count ?? 0}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-100 py-2 px-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Skipped
                  </p>
                  <p className="text-lg lg:text-2xl font-bold text-slate-500 tabular-nums">
                    {tp?.skipped_count ?? 0}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </footer>
    </div>
  );
}
