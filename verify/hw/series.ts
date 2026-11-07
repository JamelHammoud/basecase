import type { Wire } from './relayHarness';

export interface Point {
  t: number;
  v: number;
}

const LAGS_MS = Array.from({ length: 26 }, (_, i) => i * 20);

export function intentSeries(sent: Wire[], joints: number): Point[][] {
  const intents = sent.filter((w) => w.msg.cmd === 'intent' && Array.isArray(w.msg.joints));

  return Array.from({ length: joints }, (_, j) =>
    intents.flatMap((w) => {
      const v = (w.msg.joints as Array<number | null>)[j];

      return typeof v === 'number' && Number.isFinite(v) ? [{ t: w.t, v }] : [];
    }),
  );
}

export function positionSeries(status: Wire[], joints: number): Point[][] {
  return Array.from({ length: joints }, (_, j) =>
    status.flatMap((w) => {
      const joint = (w.msg.joints as Array<{ id: number; position: number | null }> | undefined)?.find(
        (x) => x.id === j + 1,
      );

      return typeof joint?.position === 'number' ? [{ t: w.t, v: joint.position }] : [];
    }),
  );
}

export const range = (points: Point[]) =>
  points.length ? Math.max(...points.map((p) => p.v)) - Math.min(...points.map((p) => p.v)) : 0;

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  const ma = a.reduce((s, x) => s + x, 0) / n;
  const mb = b.reduce((s, x) => s + x, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;

  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }

  return da && db ? num / Math.sqrt(da * db) : 0;
}

function valueAt(points: Point[], t: number): number | null {
  let found: number | null = null;

  for (const p of points) {
    if (p.t > t) break;

    found = p.v;
  }

  return found;
}

export function bestCorrelation(intents: Point[], positions: Point[]): number {
  let best = 0;

  for (const lag of LAGS_MS) {
    const pairs = intents.flatMap((p) => {
      const v = valueAt(positions, p.t + lag);

      return v === null ? [] : [[p.v, v]];
    });
    const r =
      pairs.length >= 10
        ? pearson(
            pairs.map((x) => x[0]),
            pairs.map((x) => x[1]),
          )
        : 0;

    if (Math.abs(r) > Math.abs(best)) best = r;
  }

  return best;
}
