import type { StoredTry } from '../src/cases/tryFile';
import { MOTION_SAMPLES, type MotionTrace } from '../src/cases/trySearch/types';

const DAY = 24 * 60 * 60 * 1000;

const steps = Array.from({ length: MOTION_SAMPLES }, (_, i) => i / (MOTION_SAMPLES - 1));
const round = (v: number) => Math.round(v * 1000) / 1000;

export function graspMotion(reach: number, wobble = 0): MotionTrace {
  return {
    body: 'fixed',
    joints: 6,
    path: steps.flatMap((s) => {
      const out = Math.min(1, s * 2) * reach;
      const up = Math.max(0, s - 0.6) * 0.4 + wobble * Math.sin(s * 9);

      return [round(out), round(up), 0];
    }),
    speed: steps.map((s) => round(Math.sin(Math.PI * s) * (1 + wobble))),
  };
}

export function waveMotion(): MotionTrace {
  return {
    body: 'fixed',
    joints: 6,
    path: steps.flatMap((s) => [0, round(0.2), round(0.15 * Math.sin(s * Math.PI * 8))]),
    speed: steps.map((s) => round(1 + 0.8 * Math.cos(s * Math.PI * 16))),
  };
}

export function walkMotion(): MotionTrace {
  return {
    body: 'mobile',
    joints: 18,
    path: steps.flatMap((s) => [round(s * 2), round(0.02 * Math.sin(s * 40)), 0]),
    speed: steps.map((s) => round(2 + Math.sin(s * 40))),
  };
}

interface TryFixture {
  id: string;
  scene: string;
  robot: string;
  caseName: string;
  verdict?: StoredTry['outcome']['verdict'];
  input?: string | null;
  daysAgo?: number;
  seconds?: number;
  motion?: MotionTrace;
}

export function storedFixture(f: TryFixture, now = Date.now()): StoredTry {
  const seconds = f.seconds ?? 12;

  return {
    version: 1,
    id: f.id,
    sceneId: f.scene,
    robot: { name: f.robot, modelHash: `model-${f.robot}`, joints: [] },
    case: { id: f.caseName.toLowerCase().replaceAll(' ', '-'), name: f.caseName, hash: 'case-hash' },
    source: 'case',
    input: f.input ?? null,
    startedAt: new Date(now - (f.daysAgo ?? 0) * DAY).toISOString(),
    seconds,
    rate: 50,
    frames: seconds * 50,
    outcome: { verdict: f.verdict ?? 'passed', margin: null },
    seed: 0,
    sourceTry: null,
    faults: [],
    ...(f.motion ? { motion: f.motion } : {}),
  };
}

export const SEARCH_FIXTURES: TryFixture[] = [
  {
    id: 'pick-failed-1',
    scene: 'scene-a',
    robot: 'SO-101',
    caseName: 'Grasp the Red Block',
    verdict: 'failed',
    input: 'leader-arm',
  },
  {
    id: 'pick-failed-2',
    scene: 'scene-b',
    robot: 'SO-101',
    caseName: 'Grasp the Red Block',
    verdict: 'failed',
    input: 'leader-arm',
  },
  {
    id: 'pick-passed',
    scene: 'scene-a',
    robot: 'SO-101',
    caseName: 'Grasp the Red Block',
    input: 'leader-arm',
  },
  { id: 'grasp-1', scene: 'scene-a', robot: 'Arm', caseName: 'Lift', motion: graspMotion(0.3) },
  { id: 'grasp-2', scene: 'scene-a', robot: 'Arm', caseName: 'Lift', motion: graspMotion(0.31, 0.01) },
  { id: 'grasp-3', scene: 'scene-b', robot: 'Arm', caseName: 'Lift', motion: graspMotion(0.28, 0.02) },
  { id: 'grasp-4', scene: 'scene-b', robot: 'Arm', caseName: 'Lift', motion: graspMotion(0.32) },
  { id: 'wave', scene: 'scene-a', robot: 'Arm', caseName: 'Wave', motion: waveMotion() },
  { id: 'walk', scene: 'scene-b', robot: 'Hexapod', caseName: 'Walk', seconds: 40, motion: walkMotion() },
];
