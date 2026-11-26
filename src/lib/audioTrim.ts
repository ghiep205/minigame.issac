export async function decodeAudioFile(
  file: File
): Promise<{ buffer: AudioBuffer; duration: number }> {
  const arrayBuffer = await file.arrayBuffer();
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const buffer = await ctx.decodeAudioData(arrayBuffer);
    return { buffer, duration: buffer.duration };
  } finally {
    await ctx.close();
  }
}

export function computeWaveformPeaks(
  buffer: AudioBuffer,
  bars = 72
): number[] {
  const channelData = buffer.getChannelData(0);
  const blockSize = Math.max(1, Math.floor(channelData.length / bars));
  const peaks: number[] = [];

  for (let i = 0; i < bars; i++) {
    const start = i * blockSize;
    const end = Math.min(channelData.length, start + blockSize);
    let maxVal = 0;
    const step = Math.max(1, Math.floor((end - start) / 200));
    for (let j = start; j < end; j += step) {
      const abs = Math.abs(channelData[j]);
      if (abs > maxVal) maxVal = abs;
    }
    peaks.push(Math.max(0.08, Math.min(1, maxVal)));
  }

  return peaks;
}

function encodeWavMono16(samples: Float32Array, sampleRate: number): Blob {
  const dataByteLength = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataByteLength);
  const view = new DataView(buffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataByteLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, 'data');
  view.setUint32(40, dataByteLength, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

export async function trimAudioBufferToWavBlob(
  sourceBuffer: AudioBuffer,
  startSeconds: number,
  durationSeconds: number
): Promise<Blob> {
  const targetSampleRate = 22050;
  const safeStart = Math.max(0, Math.min(startSeconds, sourceBuffer.duration));
  const safeDuration = Math.max(
    0.5,
    Math.min(durationSeconds, sourceBuffer.duration - safeStart)
  );
  const frameCount = Math.max(1, Math.floor(safeDuration * targetSampleRate));

  const offlineCtx = new OfflineAudioContext(1, frameCount, targetSampleRate);
  const source = offlineCtx.createBufferSource();
  source.buffer = sourceBuffer;

  const gainNode = offlineCtx.createGain();
  const fadeTime = Math.min(0.03, safeDuration / 4);
  gainNode.gain.setValueAtTime(0.001, 0);
  gainNode.gain.linearRampToValueAtTime(1, fadeTime);
  gainNode.gain.setValueAtTime(1, Math.max(fadeTime, safeDuration - fadeTime));
  gainNode.gain.linearRampToValueAtTime(0.001, safeDuration);

  source.connect(gainNode);
  gainNode.connect(offlineCtx.destination);
  source.start(0, safeStart, safeDuration);

  const rendered = await offlineCtx.startRendering();
  const monoSamples = rendered.getChannelData(0);
  return encodeWavMono16(monoSamples, targetSampleRate);
}

export function formatTimeSec(sec: number): string {
  const clamped = Math.max(0, sec);
  const mins = Math.floor(clamped / 60);
  const secs = Math.floor(clamped % 60);
  const tenths = Math.floor((clamped % 1) * 10);
  return `${mins}:${secs.toString().padStart(2, '0')}.${tenths}`;
}
