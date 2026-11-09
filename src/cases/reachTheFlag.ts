import type { ScenePart } from '../types/robotics';
import type { Rig, V3 } from '../utils/kinematics';
import { robotFacts } from './robotFit';
import { CASE_FORMAT_VERSION, type Capability, type Case } from './schema';

const FLAG_DISTANCE_MM = 900;
const FLAG_RADIUS_MM = 160;
const HOLD_SECONDS = 0.3;
const WALK_SECONDS = 14;
const ROLL_SECONDS = 8;

export function reachTheFlagCase(rig: Rig, parts: ScenePart[]): Case {
  const facts = robotFacts(rig, parts);
  const legs = facts.capabilities.includes('legs');
  const needs: Capability[] = legs ? ['legs'] : ['wheels'];
  const pivot = rig.robots[0]?.pivot ?? ([0, 0, 0] as V3);
  const flag: V3 = [pivot[0], Math.max(pivot[1], 40), pivot[2] + FLAG_DISTANCE_MM];
  const seconds = legs ? WALK_SECONDS : ROLL_SECONDS;

  return {
    formatVersion: CASE_FORMAT_VERSION,
    id: 'reach-the-flag',
    name: 'Reach the Flag',
    brief: 'Drive to the flag and stop on it.',
    slot: { needs, binding: {} },
    world: {
      objects: [
        {
          id: 'flag',
          name: 'Flag',
          kind: 'cylinder',
          position: flag,
          rotation: [0, 0, 0],
          size: [FLAG_RADIUS_MM * 2, Math.max(flag[1] * 2, 20), FLAG_RADIUS_MM * 2],
          color: '#0d99ff',
          opacity: 0.35,
          behavior: 'marker',
        },
      ],
    },
    controls: [
      { id: 'move', label: 'Move', input: 'move' },
      { id: 'turn', label: 'Turn', input: 'turn' },
    ],
    reference: { timeline: [{ at: 0.5, target: [flag[0], pivot[1], flag[2]] }] },
    task: {
      seconds,
      probes: [{ signal: 'flag', from: 'base', to: { object: 'flag' } }],
      contract: {
        version: 1,
        success: {
          hold_for: {
            seconds: HOLD_SECONDS,
            within: 'whole',
            state: {
              atom: { expr: { signal: 'flag' }, cmp: '<', value: FLAG_RADIUS_MM, scale: FLAG_RADIUS_MM },
            },
          },
        },
        failures: [],
      },
    },
  };
}
