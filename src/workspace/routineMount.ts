import { PART_CATALOG } from '../data/catalog';
import { isNeck } from '../routines/capabilities';
import type { Capability } from '../routines/schema';
import type { CatalogItem, RobotJoint, ScenePart } from '../types/robotics';
import { catalogPart } from './partFactories';
import type { Vec3 } from './types';

const ADD_PARTS: Partial<Record<Capability, string>> = {
  camera: 'raspberry-pi-camera-3',
  depth: 'luxonis-oak-d-lite',
  speaker: 'adafruit-speaker-40mm',
  microphone: 'seeed-respeaker-mic-array-v2',
};

export const ADD_LABELS: Partial<Record<Capability, string>> = {
  camera: 'Add Camera',
  depth: 'Add Depth Camera',
  speaker: 'Add Speaker',
  microphone: 'Add Microphone',
};

export const canAdd = (capability: Capability) => !!ADD_PARTS[capability];

export function addItemFor(capability: Capability): CatalogItem | null {
  const componentId = ADD_PARTS[capability];

  return PART_CATALOG.find((c) => c.componentId === componentId) ?? null;
}

function topOf(parts: ScenePart[]): ScenePart | null {
  const solid = parts.filter((p) => p.role === 'solid');

  return solid.reduce<ScenePart | null>(
    (best, p) =>
      !best || p.position[1] + p.dimensions.height / 2 > best.position[1] + best.dimensions.height / 2 ? p : best,
    null,
  );
}

function hostPart(parts: ScenePart[], joints: RobotJoint[]): { part: ScenePart; joint: RobotJoint | null } | null {
  const byId = new Map(parts.map((p) => [p.id, p]));
  const neck = joints.find(isNeck);
  const head = neck?.child.map((id) => byId.get(id)).find(Boolean);

  if (neck && head) return { part: head, joint: neck };

  const robotIds = new Set(joints.flatMap((j) => [...j.parent, ...j.child]));
  const top = topOf(parts.filter((p) => robotIds.has(p.id))) ?? topOf(parts);

  return top ? { part: top, joint: null } : null;
}

const mountedOn = (joints: RobotJoint[], host: { part: ScenePart; joint: RobotJoint | null }, id: string) =>
  joints.map((j) => {
    if (host.joint) return j.id === host.joint.id ? { ...j, child: [...j.child, id] } : j;

    return j.parent.includes(host.part.id) ? { ...j, parent: [...j.parent, id] } : j;
  });

export function mountPart(options: { parts: ScenePart[]; joints: RobotJoint[]; item: CatalogItem; id: string }): {
  part: ScenePart;
  joints: RobotJoint[];
} {
  const { parts, joints, item, id } = options;
  const host = hostPart(parts, joints);

  if (!host) return { part: catalogPart(item, id, parts), joints };

  const { position, dimensions } = host.part;
  const at: Vec3 = [position[0], position[1] + dimensions.height / 2, position[2] + dimensions.depth / 4];
  const placed = catalogPart(item, id, parts, at);

  return { part: placed, joints: mountedOn(joints, host, id) };
}
