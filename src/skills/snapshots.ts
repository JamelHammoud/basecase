import { isPolicySpec, type PolicySpec } from '../sim/policy';

export const MAX_SNAPSHOTS = 12;

export const SNAPSHOT_EVERY_S = 15;

export interface SnapshotRef {
  run: string;
  iteration: number;
  steps: number;
}

export interface Snapshots {
  load: (ref: SnapshotRef, skill?: string) => Promise<PolicySpec | null>;
  keep: (hash: string, refs: SnapshotRef[]) => Promise<SnapshotRef[]>;
}

export interface SnapshotTrail {
  written: number;
  kept: Array<{ order: number; ref: SnapshotRef }>;
}

export const NO_SNAPSHOTS: SnapshotTrail = { written: 0, kept: [] };

function thinnedAt(orders: number[]): number {
  let at = 1;

  for (let i = 2; i < orders.length - 1; i++) {
    if (orders[i + 1] - orders[i - 1] < orders[at + 1] - orders[at - 1]) at = i;
  }

  return at;
}

export function withSnapshot(trail: SnapshotTrail, ref: SnapshotRef, max = MAX_SNAPSHOTS): SnapshotTrail {
  const order = trail.written + 1;
  const kept = [...trail.kept, { order, ref }];

  if (kept.length > max) kept.splice(thinnedAt(kept.map((k) => k.order)), 1);

  return { written: order, kept };
}

export const trailRefs = (trail: SnapshotTrail) => trail.kept.map((k) => k.ref);

export const newestSnapshot = (trail: SnapshotTrail): SnapshotRef | null => trail.kept.at(-1)?.ref ?? null;

const isRef = (value: unknown): value is SnapshotRef => {
  const ref = value as SnapshotRef | null;

  return (
    typeof ref?.run === 'string' && Number.isSafeInteger(ref.iteration) && Number.isFinite(ref.steps) && ref.steps >= 0
  );
};

export const snapshotRefs = (value: unknown): SnapshotRef[] =>
  Array.isArray(value) ? value.filter(isRef).slice(0, MAX_SNAPSHOTS) : [];

export const sameSnapshot = (a: SnapshotRef | null, b: SnapshotRef | null) =>
  !!a && !!b && a.run === b.run && a.iteration === b.iteration;

interface SnapshotBridge {
  getSnapshot: (ref: { run: string; iteration: number; skill?: string }) => Promise<unknown>;
  keepSnapshots: (payload: { hash: string; snapshots: SnapshotRef[] }) => Promise<unknown>;
}

export function bridgeSnapshots(bridge: SnapshotBridge): Snapshots {
  return {
    load: async (ref, skill) => {
      const spec = await bridge
        .getSnapshot({ run: ref.run, iteration: ref.iteration, ...(skill ? { skill } : {}) })
        .catch(() => null);

      return isPolicySpec(spec) ? spec : null;
    },
    keep: async (hash, refs) => {
      if (!refs.length) return [];

      return snapshotRefs(await bridge.keepSnapshots({ hash, snapshots: refs }).catch(() => []));
    },
  };
}

export const NO_SNAPSHOT_STORE: Snapshots = { load: () => Promise.resolve(null), keep: () => Promise.resolve([]) };
