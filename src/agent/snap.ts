import type { MateType, PartMate, Port } from '../types/ports';
import type { ScenePart } from '../types/robotics';
import type { V3 } from './agentFrame';
import { applySpec } from './agentScene';
import { planMate } from './mate';
import { mateTypeFor } from './portFit';
import { portsOf, worldPort, type WorldPort } from './ports';

export { fitProblem, mateTypeFor } from './portFit';

export const SNAP_MM = 8;

const MEMBER = /-\d+$/;

export function snapPorts(part: ScenePart): Port[] {
  if (part.kind === 'hardware' || part.kind === 'image_plane') return [];

  const ports = portsOf(part);
  const circles = new Set(ports.filter((p) => p.kind === 'hole_circle').map((p) => p.name));

  return ports.filter((p) => !(MEMBER.test(p.name) && circles.has(p.name.replace(MEMBER, ''))));
}

export interface PortAt {
  part: string;
  port: Port;
  at: WorldPort;
}

export const portsAt = (part: ScenePart): PortAt[] =>
  snapPorts(part).map((port) => ({ part: part.id, port, at: worldPort(part, port) }));

function dependents(parts: ScenePart[], id: string): Set<string> {
  const found = new Set([id]);
  let grew = true;

  while (grew) {
    grew = false;

    for (const p of parts) {
      const target = p.mates?.at(-1)?.target;

      if (target && found.has(target) && !found.has(p.id)) {
        found.add(p.id);
        grew = true;
      }
    }
  }

  return found;
}

export function snapTargets(parts: ScenePart[], moverId: string): PortAt[] {
  const skip = dependents(parts, moverId);

  return parts.filter((p) => p.visible && !skip.has(p.id)).flatMap(portsAt);
}

export const distanceMm = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export interface SnapPair {
  port: string;
  target: string;
  targetPort: string;
  type: MateType;
  distanceMm: number;
}

export function nearestPair(mover: PortAt[], targets: PortAt[], reachMm: number): SnapPair | null {
  let best: SnapPair | null = null;

  for (const m of mover) {
    for (const t of targets) {
      const d = distanceMm(m.at.position, t.at.position);
      const type: MateType | null = d <= reachMm && (!best || d < best.distanceMm) ? mateTypeFor(m.port, t.port) : null;

      if (type) best = { port: m.port.name, target: t.part, targetPort: t.port.name, type, distanceMm: d };
    }
  }

  return best;
}

export type SnapPlacement = Pick<ScenePart, 'position' | 'rotation' | 'mates' | 'frame'>;

export interface Snap {
  pair: SnapPair;
  placement: SnapPlacement;
}

export function snapPose(parts: ScenePart[], mover: ScenePart, pair: SnapPair): Snap | null {
  const scene = [...parts.filter((p) => p.id !== mover.id), mover];
  const plan = planMate(scene, {
    part: mover.id,
    port: pair.port,
    target: pair.target,
    targetPort: pair.targetPort,
    type: pair.type,
  });

  if (typeof plan === 'string' || plan.op.op !== 'update') return null;

  const placed = applySpec(mover, plan.op.part);
  const mates: PartMate[] = (placed.mates ?? []).slice(-1);

  return { pair, placement: { position: placed.position, rotation: placed.rotation, mates, frame: placed.frame } };
}

export interface SnapInput {
  parts: ScenePart[];
  mover: ScenePart;
  reachMm: number;
  free: boolean;
  targets?: PortAt[];
}

export function snapPart({ parts, mover, reachMm, free, targets }: SnapInput): Snap | null {
  if (free) return null;

  const pair = nearestPair(portsAt(mover), targets ?? snapTargets(parts, mover.id), reachMm);

  return pair && snapPose(parts, mover, pair);
}

export interface NearbyPorts {
  mover: PortAt[];
  targets: PortAt[];
}

export function nearbyPorts(mover: PortAt[], targets: PortAt[], withinMm: number): NearbyPorts {
  const close = (m: PortAt, t: PortAt) =>
    distanceMm(m.at.position, t.at.position) <= withinMm && mateTypeFor(m.port, t.port) !== null;

  return {
    mover: mover.filter((m) => targets.some((t) => close(m, t))),
    targets: targets.filter((t) => mover.some((m) => close(m, t))),
  };
}
