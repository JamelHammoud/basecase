import type { SilhouetteSource } from '../cameras/silhouetteSource';
import { DEFAULT_MOUNT, type MountFrame } from '../reality/mountSearch';
import type { JointMount } from '../reality/types';
import { canRunBench, playBench, type BenchPlan } from './benchRun';
import { mountOf, type RobotMount, type RobotStatus } from './robotState';
import { robotSnapshot, sendRobotCommand, setRobotMounts, subscribeRobot } from './robotStore';

export const WIGGLE_RAD = 0.1;

const STEPS: Array<[number, number]> = [
  [0.5, WIGGLE_RAD],
  [1.75, -WIGGLE_RAD],
  [3.5, 0],
];

const SHOT_WINDOW_S = 0.3;

export const WIGGLE: BenchPlan = {
  seconds: 4,
  offset: (seconds) => STEPS.findLast(([at]) => seconds >= at)?.[1] ?? 0,
};

const REENTER_MS = 6000;

function countsOf(status: RobotStatus, ids: readonly number[]): number[] | null {
  const counts = ids.map((id) => status.joints.find((j) => j.id === id)?.position);

  return counts.every((c): c is number => typeof c === 'number') ? counts : null;
}

interface Heard {
  counts: number[] | null;
  frame: Promise<MountFrame['silhouette'] | null>;
}

function shotBefore(stepS: number, seconds: number[]) {
  let pick = -1;

  seconds.forEach((t, i) => {
    if (t < stepS && t >= stepS - SHOT_WINDOW_S) pick = i;
  });

  return pick;
}

export async function captureWiggle(k: number, source: SilhouetteSource): Promise<MountFrame[] | null> {
  const ids = robotSnapshot().spec?.ids ?? [];
  const heard: Heard[] = [];
  const recording = await playBench([k], WIGGLE, (status) =>
    heard.push({ counts: countsOf(status, ids), frame: source.frame() }),
  );

  if (!recording) return null;

  const seconds = recording.samples.map((s) => s.seconds);
  const frames = await Promise.all(
    STEPS.map(async ([stepS]) => {
      const shot = heard[shotBefore(stepS, seconds)];
      const silhouette = await shot?.frame;

      return shot?.counts && silhouette ? { counts: shot.counts, silhouette } : null;
    }),
  );

  return frames.every((f): f is MountFrame => f !== null) ? frames : null;
}

export const jointMount = (mount: RobotMount | undefined): JointMount =>
  mount ? { zeroCounts: mount.zero_counts, direction: mount.direction } : DEFAULT_MOUNT;

export const connectionMounts = (): JointMount[] => {
  const { spec, calibration } = robotSnapshot();

  return (spec?.ids ?? []).map((id) => jointMount(mountOf(calibration, id)));
};

export const robotMounts = (mounts: readonly JointMount[]): RobotMount[] =>
  (robotSnapshot().spec?.ids ?? []).map((id, k) => ({
    id,
    zero_counts: mounts[k].zeroCounts,
    direction: mounts[k].direction,
  }));

function waitFor(ready: () => boolean, ms: number): Promise<boolean> {
  if (ready()) return Promise.resolve(true);

  return new Promise((resolve) => {
    const done = (ok: boolean) => {
      clearTimeout(timer);
      unsubscribe();
      resolve(ok);
    };
    const unsubscribe = subscribeRobot(() => {
      if (ready()) done(true);
    });
    const timer = setTimeout(() => done(false), ms);
  });
}

const stopped = () => robotSnapshot().status?.run !== 'running';

export async function remount(mounts: readonly JointMount[]): Promise<boolean> {
  const reply = await setRobotMounts(robotMounts(mounts));

  if (!reply.ok || !(await waitFor(stopped, REENTER_MS))) return false;

  await sendRobotCommand({ cmd: 'enter', mode: 'test' });

  return waitFor(() => canRunBench(robotSnapshot()), REENTER_MS);
}
