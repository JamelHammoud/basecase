import * as THREE from 'three';
import type { WorldObject } from './schema';

export const travelSignal = (id: string) => `${id}-travel`;

export function fixtureTravel(object: WorldObject, deltas: Map<string, THREE.Matrix4>): number {
  const joint = object.joint;
  const moved = deltas.get(object.id);

  if (!joint || !moved || joint.locked) return 0;

  const parent = object.parent ? deltas.get(object.parent) : undefined;
  const relative = parent ? parent.clone().invert().multiply(moved) : moved;
  const axis = new THREE.Vector3(...joint.axis);

  if (joint.type === 'prismatic') return new THREE.Vector3().setFromMatrixPosition(relative).dot(axis);

  const q = new THREE.Quaternion().setFromRotationMatrix(relative).normalize();
  const signed = new THREE.Vector3(q.x, q.y, q.z).dot(axis);
  const angle = (2 * Math.atan2(signed, q.w) * 180) / Math.PI;

  return THREE.MathUtils.euclideanModulo(angle + 180, 360) - 180;
}

export const fixtureSignals = (objects: readonly WorldObject[]) =>
  objects.filter((o) => o.joint).map((o) => travelSignal(o.id));

export const probeSignals = (
  kase: { task: { probes: readonly { signal: string }[] }; world?: { objects: readonly WorldObject[] } } | null,
) => [...(kase?.task.probes.map((p) => p.signal) ?? []), ...fixtureSignals(kase?.world?.objects ?? [])];
