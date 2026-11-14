import * as THREE from 'three';
import type { BooleanFrame, ScenePart } from '../types/robotics';
import { isBooleanPart, type BooleanPart } from './parts';
import { quaternionOf } from './rotation';

export type Axes = [boolean, boolean, boolean];

export interface Stretch {
  fixed: Axes;
  by: ScenePart | null;
}

interface Holder {
  part: ScenePart;
  fixed: Axes;
}

const FREE: Axes = [false, false, false];
const EVERY_AXIS: Axes = [true, true, true];
const ROUND_SIDES: Axes = [true, false, true];
const ROUND_KINDS = new Set(['tube', 'torus']);
const UNIT_AXES = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
const LEANS = 1e-3;
const EDGE_MM = 0.01;
const MESH_OVERHANG = 1.1;

export const keepsShape = (part: ScenePart) => !!part.componentId || !!part.hardware || part.kind === 'component';

const shaping = (part: BooleanPart) =>
  part.boolean.op === 'subtract' ? part.boolean.operands.slice(0, 1) : part.boolean.operands;

function holders(part: ScenePart): Holder[] {
  if (isBooleanPart(part)) return shaping(part).flatMap(holders);

  if (keepsShape(part)) return [{ part, fixed: EVERY_AXIS }];

  return ROUND_KINDS.has(part.kind) ? [{ part, fixed: ROUND_SIDES }] : [];
}

function halfSize(part: ScenePart): number[] {
  const { width, height, depth } = part.dimensions;

  if (keepsShape(part)) return [width, height, depth].map((v) => (v / 2) * MESH_OVERHANG);

  const round = Math.min(width, depth) / 2;

  return [round, height / 2, round];
}

function heldAxes(holder: Holder, frame: BooleanFrame): Axes {
  const into = quaternionOf(frame.rotation).invert();
  const turn = into.clone().multiply(quaternionOf(holder.part.rotation));
  const directions = UNIT_AXES.map((axis) => axis.clone().applyQuaternion(turn));
  const centre = new THREE.Vector3(...holder.part.position)
    .sub(new THREE.Vector3(...frame.position))
    .applyQuaternion(into);
  const half = halfSize(holder.part);
  const bounds = [frame.dimensions.width, frame.dimensions.height, frame.dimensions.depth].map((v) => v / 2 - EDGE_MM);

  return [0, 1, 2].map((i) => {
    const leans = directions.map((d) => Math.abs(d.getComponent(i)));
    const reach = leans.reduce((sum, lean, j) => sum + lean * half[j], 0);
    const held = holder.fixed.some((fixed, j) => fixed && leans[j] > LEANS);

    return held && Math.abs(centre.getComponent(i)) + reach >= bounds[i];
  }) as Axes;
}

const frameOf = (part: BooleanPart): BooleanFrame =>
  part.boolean.frame ?? { position: part.position, rotation: part.rotation, dimensions: part.dimensions };

export function stretchOf(part: BooleanPart): Stretch {
  const frame = frameOf(part);

  return holders(part).reduce<Stretch>(
    (acc, holder) => {
      const fixed = heldAxes(holder, frame);

      if (!fixed.some(Boolean)) return acc;

      return { fixed: acc.fixed.map((held, i) => held || fixed[i]) as Axes, by: acc.by ?? holder.part };
    },
    { fixed: FREE, by: null },
  );
}

export const resizeReason = (stretch: Stretch | null) =>
  stretch?.by ? `${stretch.by.name} keeps its shape. Select it in Layers to move or resize it.` : null;
