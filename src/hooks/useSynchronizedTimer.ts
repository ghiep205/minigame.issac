'use client';

import { useEffect, useState } from 'react';
import type { GameSession } from '@/types/quiz';

function computeRemaining(
  session: GameSession | null,
  serverOffsetMs: number
): number {
  if (!session) return 0;
  if (session.status === 'completed') return 0;
  if (session.status === 'pending') return session.timer_duration;

  if (session.timer_running && session.current_started_at) {
    const startedMs = Date.parse(session.current_started_at);
    const nowServerMs = Date.now() + serverOffsetMs;
    const elapsedSec = (nowServerMs - startedMs) / 1000;
    return Math.max(0, session.timer_duration - elapsedSec);
  }

  const paused = session.paused_remaining_seconds;
  if (paused !== null && paused !== undefined) {
    return Math.max(0, Number(paused));
  }

  return session.timer_duration;
}

export function useSynchronizedTimer(
  session: GameSession | null,
  serverOffsetMs: number
) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!session || !session.timer_running || !session.current_started_at) {
      return;
    }

    const interval = setInterval(() => {
      setTick((t) => (t + 1) % 1_000_000);
    }, 100);

    return () => clearInterval(interval);
  }, [session]);

  const remainingSeconds = computeRemaining(session, serverOffsetMs);
  const displaySeconds = Math.ceil(remainingSeconds);
  const isTimeUp =
    Boolean(session) &&
    (session?.status === 'playing' || session?.status === 'paused') &&
    Boolean(session?.current_question_id) &&
    remainingSeconds <= 0;

  return {
    remainingSeconds,
    displaySeconds,
    isTimeUp,
  };
}
