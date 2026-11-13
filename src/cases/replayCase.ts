import type { RobotRun } from '../robot/runBuffer';
import type { Formula } from '../skills/contract';
import { builtCase, caseSlug, type BuiltCase } from './caseBuilder';
import { CASE_FORMAT_VERSION, type ReferenceCommand, type WorldObject } from './schema';

export const REPLAY_LEAD_S = 1.5;
export const STALL_SHARE = 0.98;

const TAIL_S = 1.5;
const MAX_REPLAY_COMMANDS = 4000;
const DEGREES = 180 / Math.PI;
const SAME_RAD = 1e-4;

export interface ReplaySpec {
  run: RobotRun;
  name: string;
  world?: WorldObject[];
}

const rounded = (x: number, places: number) => Math.round(x * 10 ** places) / 10 ** places;

function jointValues(ids: readonly string[], radians: ReadonlyArray<number | null>): Record<string, number> {
  return Object.fromEntries(
    ids.flatMap((id, k) => {
      const value = radians[k];

      return typeof value === 'number' && Number.isFinite(value) ? [[id, rounded(value * DEGREES, 3)]] : [];
    }),
  );
}

const sameIntent = (a: number[], b: number[]) => a.every((x, k) => Math.abs(x - b[k]) < SAME_RAD || x === b[k]);

function playedIntents(run: RobotRun) {
  const from = run.statuses[0].at;
  const kept = run.intents
    .filter((i) => i.at >= from)
    .filter((i, n, all) => n === all.length - 1 || n === 0 || !sameIntent(i.joints, all[n - 1].joints));
  const every = Math.ceil(kept.length / MAX_REPLAY_COMMANDS);

  return kept.filter((_, n) => n % every === 0 || n === kept.length - 1);
}

export function replayTimeline(run: RobotRun): ReferenceCommand[] {
  const from = run.statuses[0].at;
  const start = { at: 0, joints: jointValues(run.joints, run.statuses[0].positions) };
  const played = playedIntents(run).map((i) => ({
    at: rounded(REPLAY_LEAD_S + (i.at - from) / 1000, 3),
    joints: jointValues(run.joints, i.joints),
  }));

  return [start, ...played];
}

const torqueBelowStall = (seconds: number): Formula => ({
  always: {
    window: { from: REPLAY_LEAD_S, to: seconds },
    state: { atom: { expr: { signal: 'torque' }, cmp: '<', value: STALL_SHARE, scale: 1 } },
  },
});

export function replayCase({ run, name, world = [] }: ReplaySpec): BuiltCase {
  const timeline = replayTimeline(run);
  const seconds = Math.ceil(timeline[timeline.length - 1].at + TAIL_S);

  return builtCase({
    formatVersion: CASE_FORMAT_VERSION,
    id: caseSlug(name),
    name,
    brief: run.message,
    slot: { needs: ['arm'], binding: {} },
    world: { objects: world },
    controls: [],
    reference: { timeline },
    task: { seconds, probes: [], contract: { version: 1, success: torqueBelowStall(seconds), failures: [] } },
  });
}
