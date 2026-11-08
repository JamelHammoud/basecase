import * as THREE from 'three';
import type { ScenePart } from '../types/robotics';
import { forwardKinematics, type Rig, type V3 } from '../utils/kinematics';
import { robotFacts, type EndEffector } from './robotFit';
import { CASE_FORMAT_VERSION, type Case, type ReferenceCommand, type WorldObject } from './schema';

const DOT_COUNT = 3;
const HOLD_SECONDS = 0.2;
const MOVE_SECONDS = 1.8;
const MIN_HEIGHT_MM = 30;
const CANDIDATE_FRACTIONS = [
  [0.45, 0.4],
  [-0.45, 0.4],
  [0.7, -0.5],
  [-0.7, -0.5],
  [0.25, 0.8],
  [-0.25, 0.8],
  [0.8, 0.1],
  [-0.8, 0.1],
];

function tipAt(rig: Rig, effector: EndEffector, values: Record<string, number>): V3 {
  const posed = forwardKinematics(rig, { values });
  const owner = rig.ownerOf.get(effector.part);
  const m = owner ? posed.joint.get(owner) : posed.root;
  const p = new THREE.Vector3(...effector.point).applyMatrix4(m ?? posed.root);

  return [p.x, p.y, p.z];
}

function candidateValues(rig: Rig, joints: string[], [first, rest]: number[]): Record<string, number> {
  const values: Record<string, number> = {};

  joints.forEach((id, i) => {
    const range = rig.byId.get(id)?.range ?? [-90, 90];
    const fraction = i === 0 ? first : rest;

    values[id] = fraction * (fraction >= 0 ? Math.max(...range) : -Math.min(...range));
  });

  return values;
}

const apart = (a: V3, b: V3, mm: number) => new THREE.Vector3(...a).distanceTo(new THREE.Vector3(...b)) > mm;

export function dotSpots(rig: Rig, effector: EndEffector, joints: string[], radius: number): V3[] {
  const rest = tipAt(rig, effector, {});
  const spots: V3[] = [];

  for (const fractions of CANDIDATE_FRACTIONS) {
    const spot = tipAt(rig, effector, candidateValues(rig, joints, fractions));
    const clear = spot[1] > MIN_HEIGHT_MM && apart(spot, rest, radius * 3);

    if (clear && spots.every((s) => apart(s, spot, radius * 3)) && spots.length < DOT_COUNT) spots.push(spot);
  }

  return spots;
}

const dotObject = (position: V3, index: number, radius: number): WorldObject => ({
  id: `dot${index}`,
  name: `Dot ${index + 1}`,
  kind: 'sphere',
  position,
  rotation: [0, 0, 0],
  size: [radius * 2, radius * 2, radius * 2],
  color: '#0d99ff',
  opacity: 0.6,
  behavior: 'marker',
});

export function touchTheDotsCase(rig: Rig, parts: ScenePart[]): Case {
  const facts = robotFacts(rig, parts);
  const effector = facts.endEffector;

  if (!effector) throw new Error('Touch the Dots needs an arm with an end effector.');

  const radius = Math.max(12, facts.reachMm * 0.08);
  const spots = dotSpots(rig, effector, facts.armJoints, radius);
  const timeline: ReferenceCommand[] = spots.map((target, i) => ({ at: 0.2 + i * MOVE_SECONDS, target }));

  return {
    formatVersion: CASE_FORMAT_VERSION,
    id: 'touch-the-dots',
    name: 'Touch the Dots',
    brief: 'Touch each dot in order with the end effector.',
    slot: {
      needs: ['arm'],
      minJoints: 2,
      binding: { endEffector: effector },
      reachMm: facts.reachMm,
      anchor: facts.anchor,
    },
    world: { objects: spots.map((spot, i) => dotObject(spot, i, radius)) },
    controls: [
      { id: 'move', label: 'Move', input: 'move' },
      { id: 'lift', label: 'Raise and Lower', input: 'lift' },
    ],
    reference: { timeline },
    task: {
      seconds: 0.5 + spots.length * MOVE_SECONDS,
      probes: spots.map((_, i) => ({ signal: `dot${i}`, from: 'end-effector', to: { object: `dot${i}` } })),
      contract: {
        version: 1,
        success: {
          sequence: spots.map((_, i) => ({
            hold_for: {
              seconds: HOLD_SECONDS,
              within: 'whole',
              state: { atom: { expr: { signal: `dot${i}` }, cmp: '<', value: radius, scale: radius } },
            },
          })),
        },
        failures: [],
      },
    },
  };
}
