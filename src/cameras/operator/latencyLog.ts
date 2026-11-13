export interface LatencyStats {
  median: number;
  p90: number;
  count: number;
}

const at = (sorted: number[], share: number) => sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))];

export function createLatencyLog(size: number) {
  let samples: number[] = [];

  return {
    add: (ms: number) => {
      samples.push(ms);

      if (samples.length > size) samples = samples.slice(-size);
    },
    clear: () => {
      samples = [];
    },
    stats: (): LatencyStats | null => {
      if (!samples.length) return null;

      const sorted = [...samples].sort((a, b) => a - b);

      return { median: at(sorted, 0.5), p90: at(sorted, 0.9), count: sorted.length };
    },
  };
}
