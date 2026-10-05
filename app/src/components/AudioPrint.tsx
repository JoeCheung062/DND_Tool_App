import { useEffect, useState } from "react";
import { fingerprintAudio } from "../lib/audioPrint";

export function AudioPrint({ url }: { url?: string }) {
  const [peaks, setPeaks] = useState<number[] | null>(null);

  useEffect(() => {
    if (!url) {
      setPeaks(null);
      return;
    }
    let cancelled = false;
    void fingerprintAudio(url).then((next) => {
      if (!cancelled) setPeaks(next.length > 0 ? next : null);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!url || !peaks) return null;
  return (
    <svg className="audio-print" viewBox={`0 0 ${peaks.length} 16`} preserveAspectRatio="none" aria-hidden="true">
      {peaks.map((peak, index) => {
        const height = Math.max(1, peak * 14);
        return <rect key={index} x={index} y={16 - height} width="0.72" height={height} fill="currentColor" />;
      })}
    </svg>
  );
}
