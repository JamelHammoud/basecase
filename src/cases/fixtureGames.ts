import type { V3 } from '../utils/kinematics';
import type { Routine } from '../routines/schema';
import { CASE_FORMAT_VERSION, type Case, type ReferenceCommand, type WorldObject } from './schema';

const BLOCK: V3 = [40, 60, 40];
const PAD: V3 = [180, 2, 90];
const PAD_Z = 250;

const block = (id: string, x: number): WorldObject => ({
  id,
  name: id,
  kind: 'box',
  position: [x, BLOCK[1] / 2, PAD_Z],
  rotation: [0, 0, 0],
  size: BLOCK,
  color: '#e8e8e8',
  behavior: 'dynamic',
  massG: 30,
});

const pad: WorldObject = {
  id: 'pad',
  name: 'Pad',
  kind: 'box',
  position: [0, PAD[1] / 2, PAD_Z],
  rotation: [0, 0, 0],
  size: PAD,
  color: '#0d99ff',
  opacity: 0.5,
  behavior: 'marker',
};

const sweep = (at: number, x: number): ReferenceCommand[] => [
  { at, target: [x, 220, 120] },
  { at: at + 0.6, target: [x, 40, 120] },
  { at: at + 1.2, target: [x, 40, 420] },
  { at: at + 2, target: [x, 220, 420] },
  { at: at + 2.6, target: [x, 220, 120] },
];

export const KNOCK_COMMANDS: ReferenceCommand[] = [...sweep(0.2, -60), ...sweep(3.4, 60)];

export const scoreWatcher = (id = 'score'): Routine['watchers'][number] => ({
  id,
  model: 'case-fact',
  rateHz: 20,
  maxAgeMs: 500,
  publishes: { type: 'number' },
});

export function gameLogic(seconds: number): Routine {
  return {
    schema: 1,
    id: 'knock-score',
    name: 'Score',
    requires: ['arms'],
    base: {
      kind: 'do',
      id: 'start',
      skill: 'drive',
      holds: ['body'],
      timeoutMs: seconds * 1000,
      onTimeout: [],
      onFail: [],
    },
    watchers: [scoreWatcher()],
    reactions: [],
    safeStop: 'drive',
  };
}

export function knockGame(options: { seconds: number; target: number; timeline?: ReferenceCommand[] }): Case {
  const { seconds, target } = options;

  return {
    formatVersion: CASE_FORMAT_VERSION,
    id: 'knock-the-blocks',
    name: 'Knock the Blocks',
    brief: `Knock ${target} blocks off the pad.`,
    slot: { needs: ['arm'], minJoints: 2, binding: {} },
    world: { objects: [pad, block('block-left', -60), block('block-right', 60)] },
    controls: [],
    reference: { timeline: options.timeline ?? [] },
    task: {
      seconds,
      probes: [],
      score: { spot: 'pad', counts: 'out' },
      contract: {
        version: 1,
        success: {
          eventually: {
            window: 'whole',
            state: { atom: { expr: { signal: 'score' }, cmp: '>', value: target - 0.5, scale: 1 } },
          },
        },
        failures: [],
      },
    },
    logic: gameLogic(seconds),
  };
}
