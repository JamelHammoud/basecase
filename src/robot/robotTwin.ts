import { useSyncExternalStore } from 'react';
import {
  AngleTrace,
  DaemonClock,
  jointGaps,
  LagWatch,
  largestGap,
  measuredAngles,
  simAngles,
  type Angles,
} from './robotGap';
import { motorsCanRun, type RobotSpec, type RobotStatus } from './robotState';
import { robotBenchDriving, robotSceneJoints, robotSnapshot, subscribeRobot } from './robotStore';

export interface RobotTwin {
  joints: readonly string[];
  measured: Angles;
  sim: Angles | null;
  gaps: Angles;
  largest: { joint: string; gap: number } | null;
  lagging: ReadonlySet<string>;
}

const trace = new AngleTrace();
const clock = new DaemonClock();
const watch = new LagWatch();
const listeners = new Set<() => void>();
let twin: RobotTwin | null = null;
let seen: { spec: RobotSpec | null; status: RobotStatus | null } = { spec: null, status: null };
let started = false;

function publish(next: RobotTwin | null) {
  if (next === twin) return;

  twin = next;

  for (const listener of listeners) listener();
}

function forConnection(spec: RobotSpec | null) {
  if (spec === seen.spec) return;

  seen = { spec, status: null };
  trace.clear();
  clock.reset();
  watch.clear();
}

function onRobot() {
  const state = robotSnapshot();
  const joints = robotSceneJoints();

  forConnection(state.link === 'connected' ? state.spec : null);

  if (state.link !== 'connected' || !motorsCanRun(state.mode) || !joints || !state.status) {
    publish(null);

    return;
  }

  if (state.status === seen.status) return;

  seen = { ...seen, status: state.status };

  const atMs = clock.pageMs(state.status.at_us, performance.now());
  const measured = measuredAngles(state);
  const sim = robotBenchDriving() ? null : trace.at(atMs);
  const gaps = jointGaps(measured, sim);

  if (sim && state.mode !== 'rehearse') watch.note({ atMs, joints, measured, gaps });

  publish({ joints, measured, sim, gaps, largest: largestGap(joints, gaps), lagging: new Set(watch.lagging) });
}

function start() {
  if (started) return;

  started = true;
  subscribeRobot(onRobot);
  onRobot();
}

export function noteSimAngles(ids: readonly string[], angles: ArrayLike<number>) {
  const joints = robotSceneJoints();

  if (!joints || robotSnapshot().link !== 'connected') return;

  start();
  trace.record(performance.now(), simAngles(joints, { ids, angles }));
}

export function forgetLag(joint: string) {
  watch.forget(joint);

  if (twin) publish({ ...twin, lagging: new Set(watch.lagging) });
}

export function subscribeTwin(listener: () => void) {
  start();
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export const twinSnapshot = () => twin;

export const useRobotTwin = () => useSyncExternalStore(subscribeTwin, twinSnapshot);
