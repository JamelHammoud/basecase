import { toCad } from '../agent/agentFrame';
import type { ArmSizing } from '../utils/armSizing';
import { MAX_TARGETS } from '../utils/armSizing';
import type { ScenePart } from '../types/robotics';
import type { ZUpVec } from '../types/skeleton';

export interface ArmTarget {
  id: string;
  name: string;
  at: ZUpVec;
}

const r1 = (v: number) => Math.round(v * 10) / 10 || 0;

export function armTargetsOf(parts: ScenePart[]): ArmTarget[] {
  const guides = parts.filter((p) => p.role === 'reference' && p.kind !== 'image_plane');

  if (guides.length > MAX_TARGETS) return [];

  return guides.map((p) => ({ id: p.id, name: p.name, at: toCad(p.position).map(r1) as ZUpVec }));
}

export function armFailure(result: Exclude<ArmSizing, { ok: true }>, targets: ArmTarget[], payloadG: number): string {
  if (result.reason === 'reach')
    return `${targets[result.target]?.name ?? 'A target'} is out of reach. Move it closer to the scene origin.`;

  return `No servo holds the ${result.joint.toLowerCase()} at ${payloadG} g. Lower the payload.`;
}
