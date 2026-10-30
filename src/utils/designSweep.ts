import * as THREE from 'three';
import { COMPONENT_BY_ID, actuatorOf, componentSize } from '../data/components';
import { SUPPLY_BY_ID } from '../data/supplies';
import type { MeshMeasure } from '../three/meshMeasure';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { unitUsd } from './actuatorCatalog';
import { partMatrix, type V3 } from './kinematics';

export type SweepParameter =
  | { kind: 'servo'; joints: string[]; values: string[] }
  | { kind: 'battery'; values: V3[] }
  | { kind: 'foot'; values: Array<{ length?: number; width?: number }> };

export interface PartEdit {
  move?: V3;
  scale?: V3;
}

export interface Variant {
  label: string;
  parts: ScenePart[];
  edits: Map<string, PartEdit>;
}

const FOOT = /\b(foot|feet|sole)\b/i;

export const isFoot = (p: ScenePart) => p.kind !== 'hardware' && p.kind !== 'component' && FOOT.test(p.name);

export function isBattery(p: ScenePart): boolean {
  const c = p.kind === 'component' && p.componentId ? COMPONENT_BY_ID[p.componentId] : undefined;

  return !!(c?.battery || c?.holder || (p.supplyId && SUPPLY_BY_ID[p.supplyId]?.battery));
}

function applyEdits(parts: ScenePart[], edits: Map<string, PartEdit>, swap?: (p: ScenePart) => ScenePart) {
  return parts.map((p) => {
    const e = edits.get(p.id);
    const moved = e?.move ? { ...p, position: p.position.map((v, k) => v + e.move![k]) as V3 } : p;
    const scaled = e?.scale ? { ...moved, dimensions: scaleDims(moved.dimensions, e.scale) } : moved;

    return swap ? swap(scaled) : scaled;
  });
}

const scaleDims = (d: ScenePart['dimensions'], s: V3) => ({
  width: d.width * s[0],
  height: d.height * s[1],
  depth: d.depth * s[2],
});

export function parseServoKey(key: string): { componentId: string; variant?: string } | string {
  const [head, variant] = key.split('|');
  const componentId = head.replace(/^component:/, '');
  const c = COMPONENT_BY_ID[componentId];

  if (!c) return `Unknown catalog key "${key}". find_parts lists the keys.`;

  if (c.variants?.length && !c.variants.some((v) => v.id === variant))
    return `"${key}": ${c.name} comes in ${c.variants.map((v) => v.id).join(', ')}. Add the version, e.g. component:${componentId}|${c.variants[0].id}.`;

  if (!actuatorOf(componentId, variant)) return `"${key}" isn't an actuator.`;

  return { componentId, variant };
}

function servoVariants(parts: ScenePart[], joints: RobotJoint[], p: Extract<SweepParameter, { kind: 'servo' }>) {
  const chosen = joints.filter((j) => p.joints.includes(j.id));
  const missing = p.joints.filter((id) => !chosen.some((j) => j.id === id));

  if (missing.length) return `No joints ${missing.join(', ')}. get_rig lists them.`;

  const ids = new Set(chosen.flatMap((j) => j.actuators ?? []));

  if (!ids.size) return 'None of those joints has a servo to swap. Assign actuators with define_joints.';

  const out: Variant[] = [];

  for (const key of p.values) {
    const servo = parseServoKey(key);

    if (typeof servo === 'string') return servo;

    const swap = (q: ScenePart): ScenePart =>
      ids.has(q.id)
        ? {
            ...q,
            componentId: servo.componentId,
            componentVariant: servo.variant,
            dimensions: componentSize(servo.componentId),
          }
        : q;

    out.push({ label: key, parts: applyEdits(parts, new Map(), swap), edits: new Map() });
  }

  return out;
}

function batteryVariants(parts: ScenePart[], values: V3[]) {
  const batteries = parts.filter(isBattery);

  if (!batteries.length) return 'No battery in the scene to move. Add one from Parts → Power.';

  return values.map((move) => {
    const edits = new Map(batteries.map((b): [string, PartEdit] => [b.id, { move }]));

    return { label: `battery ${move.map((v) => Math.round(v)).join(', ')} mm`, parts: applyEdits(parts, edits), edits };
  });
}

function footVariants(parts: ScenePart[], values: Array<{ length?: number; width?: number }>) {
  const feet = parts.filter(isFoot);

  if (!feet.length) return 'No parts named as feet (Foot, Feet or Sole).';

  return values.map((v) => {
    const scale: V3 = [v.width ?? 1, 1, v.length ?? 1];
    const edits = new Map(feet.map((f): [string, PartEdit] => [f.id, { scale }]));

    return { label: `feet ${scale[2]}× long, ${scale[0]}× wide`, parts: applyEdits(parts, edits), edits };
  });
}

export function sweepVariants(parts: ScenePart[], joints: RobotJoint[], p: SweepParameter): Variant[] | string {
  if (!p.values.length) return 'Give at least one value to try.';

  if (p.kind === 'servo') return servoVariants(parts, joints, p);

  return p.kind === 'battery' ? batteryVariants(parts, p.values) : footVariants(parts, p.values);
}

const rotationOf = (p: ScenePart) => new THREE.Matrix4().extractRotation(partMatrix(p)).elements;

function worldScale(p: ScenePart, s: V3): V3 {
  const e = rotationOf(p);

  return [0, 1, 2].map((row) => [0, 1, 2].reduce((sum, col) => sum + Math.abs(e[col * 4 + row]) * s[col], 0)) as V3;
}

function editMeasure(m: MeshMeasure, p: ScenePart, e: PartEdit): MeshMeasure {
  const move = e.move ?? [0, 0, 0];
  const s = e.scale ? worldScale(p, e.scale) : ([1, 1, 1] as V3);
  const c = m.centroid;
  const at = (v: V3, k: number) => c[k] + (v[k] - c[k]) * s[k] + move[k];

  return {
    ...m,
    volumeMm3: m.volumeMm3 * (e.scale ? e.scale[0] * e.scale[1] * e.scale[2] : 1),
    min: [0, 1, 2].map((k) => at(m.min, k)) as V3,
    max: [0, 1, 2].map((k) => at(m.max, k)) as V3,
    centroid: [0, 1, 2].map((k) => c[k] + move[k]) as V3,
  };
}

export function editMeasures(
  measures: Record<string, MeshMeasure | undefined>,
  parts: ScenePart[],
  edits: Map<string, PartEdit>,
): Record<string, MeshMeasure | undefined> {
  const out = { ...measures };

  for (const p of parts) {
    const e = edits.get(p.id);
    const m = measures[p.id];

    if (e && m) out[p.id] = editMeasure(m, p, e);
  }

  return out;
}

export function editTriangles(tris: Float32Array, p: ScenePart, e: PartEdit, m?: MeshMeasure): Float32Array {
  if (!e.scale) return tris;

  const centre = m ? new THREE.Vector3(...m.centroid).applyMatrix4(partMatrix(p).invert()) : new THREE.Vector3();
  const c = centre.toArray();
  const out = new Float32Array(tris.length);

  for (let i = 0; i < tris.length; i++) out[i] = c[i % 3] + (tris[i] - c[i % 3]) * e.scale[i % 3];

  return out;
}

function servoUsd(p: ScenePart | undefined): number | undefined {
  if (!p?.componentId) return undefined;

  const key = `component:${p.componentId}`;

  return (p.componentVariant ? unitUsd(`${key}|${p.componentVariant}`) : undefined) ?? unitUsd(key);
}

export function servosUsd(parts: ScenePart[], joints: RobotJoint[]): number | undefined {
  const byId = new Map(parts.map((p) => [p.id, p]));
  const prices = [...new Set(joints.flatMap((j) => j.actuators ?? []))].map((id) => servoUsd(byId.get(id)));
  const known = prices.filter((v): v is number => v !== undefined);

  return known.length ? known.reduce((s, v) => s + v, 0) : undefined;
}
