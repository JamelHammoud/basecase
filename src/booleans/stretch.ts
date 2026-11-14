import * as THREE from 'three';
import type { ScenePart } from '../types/robotics';
import { isBooleanPart, type BooleanPart } from './parts';
import { quaternionOf } from './rotation';

export type Axes = [boolean, boolean, boolean];

export interface Stretch {
  fixed: Axes;
  by: ScenePart | null;
}

const FREE: Axes = [false, false, false];
const EVERY_AXIS: Axes = [true, true, true];
const ROUND_SIDES: Axes = [true, false, true];
const ROUND_KINDS = new Set(['tube', 'torus']);
const UNIT_AXES = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
const LEANS = 1e-3;

export const keepsShape = (part: ScenePart) => !!part.componentId || !!part.hardware || part.kind === 'component';

function ownStretch(part: ScenePart): Stretch {
  if (isBooleanPart(part)) return stretchOf(part);

  if (keepsShape(part)) return { fixed: EVERY_AXIS, by: part };

  return ROUND_KINDS.has(part.kind) ? { fixed: ROUND_SIDES, by: part } : { fixed: FREE, by: null };
}

function inFrame(fixed: Axes, turn: THREE.Quaternion): Axes {
  const directions = UNIT_AXES.map((axis) => axis.clone().applyQuaternion(turn));

  return [0, 1, 2].map((i) => fixed.some((held, j) => held && Math.abs(directions[j].getComponent(i)) > LEANS)) as Axes;
}

const shaping = (part: BooleanPart) =>
  part.boolean.op === 'subtract' ? part.boolean.operands.slice(0, 1) : part.boolean.operands;

export function stretchOf(part: BooleanPart): Stretch {
  const frame = quaternionOf(part.rotation).invert();

  return shaping(part).reduce<Stretch>(
    (acc, operand) => {
      const own = ownStretch(operand);

      if (!own.by) return acc;

      const fixed = inFrame(own.fixed, frame.clone().multiply(quaternionOf(operand.rotation)));

      if (!fixed.some(Boolean)) return acc;

      return { fixed: acc.fixed.map((held, i) => held || fixed[i]) as Axes, by: acc.by ?? own.by };
    },
    { fixed: FREE, by: null },
  );
}

export const resizeReason = (stretch: Stretch | null) =>
  stretch?.by ? `${stretch.by.name} keeps its shape. Resize the parts in Layers.` : null;
