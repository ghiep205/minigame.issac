'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Music,
  Upload,
  Play,
  Square,
  Scissors,
  Trash2,
  Loader2,
} from 'lucide-react';
import {
  computeWaveformPeaks,
  decodeAudioFile,
  formatTimeSec,
  trimAudioBufferToWavBlob,
} from '@/lib/audioTrim';

export interface PendingAudioClip {
  blob: Blob | null;
  startSeconds: number | null;
  durationSeconds: number | null;
  removed: boolean;
}

interface AudioClipEditorProps {
  existingAudioUrl: string | null;
  existingStartSeconds: number | null;
  existingDurationSeconds: number | null;
  onChange: (clip: PendingAudioClip) => void;
}

const MAX_CLIP_SECONDS = 20;

export function AudioClipEditor({
  existingAudioUrl,
  existingStartSeconds,
  existingDurationSeconds,
  onChange,
}: AudioClipEditorProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [totalDuration, setTotalDuration] = useState<number>(0);
  const [startSeconds, setStartSeconds] = useState<number>(
    existingStartSeconds ?? 0
  );
  const [clipDuration, setClipDuration] = useState<number>(
    existingDurationSeconds ?? MAX_CLIP_SECONDS
  );
  const [decoding, setDecoding] = useState(false);
  const [encoding, setEncoding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasRemovedExisting, setHasRemovedExisting] = useState(false);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [previewProgress, setPreviewProgress] = useState(0);

  const previewCtxRef = useRef<AudioContext | null>(null);
  const previewSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopPreview() {
    if (previewTimerRef.current) {
      clearInterval(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    if (previewSourceRef.current) {
      try {
        previewSourceRef.current.stop();
      } catch {
        // already stopped
      }
      previewSourceRef.current = null;
    }
    if (previewCtxRef.current) {
      void previewCtxRef.current.close();
      previewCtxRef.current = null;
    }
    setIsPlayingPreview(false);
    setPreviewProgress(0);
  }

  useEffect(() => {
    return () => {
      stopPreview();
    };
  }, []);

  async function regenerateClip(
    buffer: AudioBuffer,
    start: number,
    duration: number
  ) {
    setEncoding(true);
    try {
      const blob = await trimAudioBufferToWavBlob(buffer, start, duration);
      onChange({
        blob,
        startSeconds: Number(start.toFixed(2)),
        durationSeconds: Number(duration.toFixed(2)),
        removed: false,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to slice audio clip.'
      );
    } finally {
      setEncoding(false);
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    stopPreview();
    setError(null);
    setDecoding(true);
    setFileName(file.name);
    setHasRemovedExisting(false);

    try {
      const { buffer, duration } = await decodeAudioFile(file);
      const effectiveClip = Math.min(MAX_CLIP_SECONDS, Math.max(1, duration));
      const waveform = computeWaveformPeaks(buffer, 72);

      setAudioBuffer(buffer);
      setTotalDuration(duration);
      setPeaks(waveform);
      setStartSeconds(0);
      setClipDuration(Number(effectiveClip.toFixed(1)));

      await regenerateClip(buffer, 0, effectiveClip);
    } catch {
      setError(
        'Could not decode audio file. Please upload MP3, WAV, M4A, or OGG.'
      );
      setAudioBuffer(null);
    } finally {
      setDecoding(false);
    }
  }

  function handleRangeUpdate(nextStart: number, nextDur: number) {
    stopPreview();
    const safeDur = Math.max(1, Math.min(MAX_CLIP_SECONDS, nextDur, totalDuration));
    const maxStart = Math.max(0, totalDuration - safeDur);
    const safeStart = Math.max(0, Math.min(nextStart, maxStart));

    setStartSeconds(Number(safeStart.toFixed(1)));
    setClipDuration(Number(safeDur.toFixed(1)));

    if (audioBuffer) {
      void regenerateClip(audioBuffer, safeStart, safeDur);
    }
  }

  async function handleTogglePreview() {
    if (isPlayingPreview) {
      stopPreview();
      return;
    }
    if (!audioBuffer) return;

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioCtx();
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);

    const startedAt = performance.now();
    const durMs = clipDuration * 1000;

    source.onended = () => {
      stopPreview();
    };

    previewCtxRef.current = ctx;
    previewSourceRef.current = source;
    setIsPlayingPreview(true);
    source.start(0, startSeconds, clipDuration);

    previewTimerRef.current = setInterval(() => {
      const elapsed = performance.now() - startedAt;
      setPreviewProgress(Math.min(1, elapsed / durMs));
    }, 60);
  }

  function handleRemoveAudio() {
    stopPreview();
    setAudioBuffer(null);
    setFileName(null);
    setPeaks([]);
    setTotalDuration(0);
    setHasRemovedExisting(true);
    onChange({
      blob: null,
      startSeconds: null,
      durationSeconds: null,
      removed: true,
    });
  }

  const maxStart = Math.max(0, totalDuration - clipDuration);
  const startPct = totalDuration > 0 ? (startSeconds / totalDuration) * 100 : 0;
  const widthPct = totalDuration > 0 ? (clipDuration / totalDuration) * 100 : 100;

  return (
    <div className="rounded-2xl bg-[#EBF6FF] border border-sky-200/80 p-4 space-y-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-white border border-sky-200 flex items-center justify-center text-sky-600">
            <Music className="w-4 h-4" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">
              Music Clip (Max 20s) — Optional
            </p>
            <p className="text-xs text-slate-500">
              Import an audio track and cut a 20s segment for this question
            </p>
          </div>
        </div>

        {(audioBuffer || (existingAudioUrl && !hasRemovedExisting)) && (
          <button
            type="button"
            onClick={handleRemoveAudio}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-red-200 text-xs font-semibold text-red-600 hover:bg-red-50 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Remove
          </button>
        )}
      </div>

      {/* Existing saved clip preview when editing */}
      {existingAudioUrl && !hasRemovedExisting && !audioBuffer && (
        <div className="rounded-xl bg-white border border-sky-100 p-3 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span className="font-semibold text-slate-800">
              Saved Clip ({existingDurationSeconds ?? 20}s)
            </span>
            {existingStartSeconds !== null && (
              <span>Cut from {formatTimeSec(existingStartSeconds)}</span>
            )}
          </div>
          <audio controls src={existingAudioUrl} className="w-full h-9" />
        </div>
      )}

      {/* Upload Track Input */}
      <label className="flex items-center justify-center gap-2 rounded-xl bg-white border border-dashed border-sky-300 hover:border-sky-500 px-4 py-2.5 text-xs font-semibold text-sky-700 cursor-pointer transition-colors">
        <Upload className="w-4 h-4" />
        {decoding
          ? 'Decoding audio track...'
          : fileName
          ? `Replace track (${fileName})`
          : 'Import Music File (MP3, WAV, M4A, OGG)'}
        <input
          type="file"
          accept="audio/*"
          onChange={handleFileSelect}
          className="hidden"
        />
      </label>

      {error && (
        <p className="text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {/* Interactive 20s Trimmer */}
      {audioBuffer && (
        <div className="rounded-xl bg-white border border-sky-100 p-4 space-y-3.5">
          <div className="flex items-center justify-between text-xs">
            <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800">
              <Scissors className="w-3.5 h-3.5 text-sky-600" />
              Selected: {formatTimeSec(startSeconds)} →{' '}
              {formatTimeSec(startSeconds + clipDuration)} ({clipDuration}s)
            </span>
            <span className="text-slate-400">
              Track length: {formatTimeSec(totalDuration)}
            </span>
          </div>

          {/* Clickable Waveform with 20s Selection Window */}
          <div
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = Math.max(
                0,
                Math.min(1, (e.clientX - rect.left) / rect.width)
              );
              handleRangeUpdate(ratio * totalDuration, clipDuration);
            }}
            title="Click anywhere on the waveform to set start position"
            className="relative h-14 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center gap-[2px] px-1 cursor-pointer"
          >
            {/* Highlighted 20s window */}
            <div
              className="absolute top-0 bottom-0 bg-sky-400/25 border-x-2 border-sky-500 pointer-events-none"
              style={{
                left: `${startPct}%`,
                width: `${widthPct}%`,
              }}
            >
              {isPlayingPreview && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-sky-700"
                  style={{ left: `${previewProgress * 100}%` }}
                />
              )}
            </div>

            {peaks.map((peak, i) => (
              <div
                key={i}
                className="flex-1 rounded-full bg-slate-400/70"
                style={{ height: `${Math.round(peak * 85)}%` }}
              />
            ))}
          </div>

          {/* Sliders */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-600">
                <label className="font-medium">Start Time</label>
                <span className="font-mono font-semibold text-sky-700">
                  {formatTimeSec(startSeconds)}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={maxStart}
                step={0.5}
                value={startSeconds}
                onChange={(e) =>
                  handleRangeUpdate(Number(e.target.value), clipDuration)
                }
                className="w-full accent-sky-500"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-600">
                <label className="font-medium">Clip Duration (max 20s)</label>
                <span className="font-mono font-semibold text-sky-700">
                  {clipDuration}s
                </span>
              </div>
              <input
                type="range"
                min={Math.min(3, totalDuration)}
                max={Math.min(MAX_CLIP_SECONDS, totalDuration)}
                step={0.5}
                value={clipDuration}
                onChange={(e) =>
                  handleRangeUpdate(startSeconds, Number(e.target.value))
                }
                className="w-full accent-sky-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={handleTogglePreview}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-xs font-semibold text-white cursor-pointer"
            >
              {isPlayingPreview ? (
                <>
                  <Square className="w-3.5 h-3.5" />
                  Stop Preview
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  Preview {clipDuration}s Clip
                </>
              )}
            </button>

            <span className="text-[11px] text-slate-500 flex items-center gap-1">
              {encoding ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin text-sky-600" />
                  Preparing clip...
                </>
              ) : (
                '20s clip ready to upload'
              )}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
