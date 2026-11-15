import * as THREE from 'three';
import { simDeltas, worldDeltas } from '../sim/mjcfFrames';
import type { SimModel } from '../sim/mjcfTypes';
import type { V3 } from '../utils/kinematics';
import type { EndEffector } from './robotFit';
import type { CaseProbe, ProbeEnd } from './schema';

export const FLOOR_PROBE_DEPTH_MM = 1_000_000;

export interface ProbeWorld {
  model: SimModel;
  effector: EndEffector | null;
  effectors?: Record<string, EndEffector | null>;
  basePart: string | null;
  basePoint: V3;
  objectAt: Map<string, V3>;
  grippers?: Record<string, string[]>;
}

export interface ProbeReader {
  sample(poses: Float64Array, out: Record<string, number[]>, contacts?: ArrayLike<number>): void;
}

function handAt(effector: EndEffector | null, model: SimModel, poses: Float64Array): THREE.Vector3 {
  const delta = effector && simDeltas(model, poses).get(effector.part);

  return new THREE.Vector3(...(effector?.point ?? [0, 0, 0])).applyMatrix4(delta ?? new THREE.Matrix4());
}

export function endPoint(end: ProbeEnd, world: ProbeWorld, poses: Float64Array): THREE.Vector3 {
  if (end === 'end-effector') return handAt(world.effector, world.model, poses);

  if (end === 'base') {
    const delta = world.basePart ? simDeltas(world.model, poses).get(world.basePart) : null;

    return new THREE.Vector3(...world.basePoint).applyMatrix4(delta ?? new THREE.Matrix4());
  }

  if ('point' in end) return new THREE.Vector3(...end.point);

  if ('effector' in end) return handAt(world.effectors?.[end.effector] ?? null, world.model, poses);

  const rest = world.objectAt.get(end.object);

  if (!rest) throw new Error(`This Case probes ${end.object}, which its world doesn’t hold.`);

  const delta = worldDeltas(world.model, poses).get(end.object);

  return new THREE.Vector3(...rest).applyMatrix4(delta ?? new THREE.Matrix4());
}

export function probeReader(probes: CaseProbe[], world: ProbeWorld): ProbeReader {
  const readers = probes.map((probe) => contactProbe(probe, world));

  return {
    sample(poses, out, contacts) {
      for (const [index, p] of probes.entries()) {
        const distance = readers[index]
          ? readers[index](contacts)
          : endPoint(p.from, world, poses).distanceTo(endPoint(p.to, world, poses));

        const series = out[p.signal] ?? [];

        series.push(distance);
        out[p.signal] = series;
      }
    },
  };
}

const objectEnd = (end: ProbeEnd) => (typeof end === 'object' && 'object' in end ? end.object : null);

function contactProbe(probe: CaseProbe, world: ProbeWorld) {
  if (!probe.kind) return null;

  const hand = typeof probe.from === 'object' && 'effector' in probe.from ? probe.from.effector : null;
  const object = objectEnd(probe.to);
  const effector = hand ? world.effectors?.[hand] : world.effector;
  const carrier = world.model.bodies.find((body) => body.parts.includes(effector?.part ?? ''));
  const jaws = hand ? (world.grippers?.[hand] ?? []) : (Object.values(world.grippers ?? {})[0] ?? []);
  const own = world.model.bodies.flatMap((body, index) => {
    const belongs = probe.kind === 'grip' ? jaws.includes(body.joint ?? '') : body.robot === carrier?.robot;

    return belongs && carrier?.robot ? [index] : [];
  });
  const target = new Set(
    world.model.bodies.flatMap((body, index) => (body.world?.includes(object ?? '') ? [index] : [])),
  );

  return (contacts?: ArrayLike<number>) => {
    const touched = new Set<number>();

    for (let i = 0; i + 1 < (contacts?.length ?? 0); i += 2) {
      const a = contacts![i];
      const b = contacts![i + 1];

      if (target.has(a)) touched.add(b);

      if (target.has(b)) touched.add(a);
    }

    if (probe.kind === 'grip') return Number(own.length === 2 && own.every((body) => touched.has(body)));

    return Number(own.some((body) => touched.has(body)));
  };
}
