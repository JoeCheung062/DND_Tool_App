const cache = new Map<string, Promise<number[]>>();

/** Peak envelope of a clip, normalized to 0–1, for a visual fingerprint. */
export function fingerprintAudio(url: string, bars = 48): Promise<number[]> {
  const cached = cache.get(`${bars}:${url}`);
  if (cached) return cached;
  const job = readFingerprint(url, bars).catch(() => [] as number[]);
  cache.set(`${bars}:${url}`, job);
  return job;
}

async function readFingerprint(url: string, bars: number) {
  const response = await fetch(url);
  if (!response.ok) return [];
  const bytes = await response.arrayBuffer();
  const context = new AudioContext();
  try {
    const audio = await context.decodeAudioData(bytes.slice(0));
    const channel = audio.getChannelData(0);
    if (channel.length === 0) return [];
    const peaks = new Array<number>(bars).fill(0);
    const size = Math.max(1, Math.floor(channel.length / bars));
    for (let index = 0; index < bars; index += 1) {
      const start = index * size;
      const end = Math.min(channel.length, start + size);
      let peak = 0;
      for (let sample = start; sample < end; sample += 16) {
        const value = Math.abs(channel[sample]);
        if (value > peak) peak = value;
      }
      peaks[index] = peak;
    }
    const max = Math.max(...peaks, 0.001);
    return peaks.map((peak) => peak / max);
  } finally {
    await context.close();
  }
}
