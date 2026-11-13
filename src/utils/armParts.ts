import { box, corners, placeholder } from '../agent/cadPlaceholder';
import { specToPart, type AgentPartSpec } from '../agent/agentScene';
import { buildSkeleton } from '../agent/skeleton';
import type { ScenePart } from '../types/robotics';
import type { RobotSkeleton } from '../types/skeleton';
import type { SizedArm } from './armSizing';

export interface PlacedArm {
  parts: ScenePart[];
  skeleton: RobotSkeleton;
}

export interface ArmPartsOptions {
  links: boolean;
  prefix: string;
}

type TemplatePart = SizedArm['template']['parts'][number];

const LINK_SIDE = 19;
const LINK_DEPTH = 44;
const HORN_LIP = 16;

function linkBox(part: TemplatePart, arm: SizedArm) {
  const lengths: Record<string, number> = {
    'shoulder-bracket': arm.shoulderMm,
    'upper-arm': arm.shape.upperArm,
    forearm: arm.shape.forearm,
    'wrist-flange': HORN_LIP + 28,
    'arm-base': 90,
  };
  const reach = lengths[part.id] ?? 0;
  const below = part.id === 'arm-base' ? LINK_DEPTH + arm.shape.riser : LINK_DEPTH;

  return corners(box([-HORN_LIP, -LINK_SIDE, -below], [reach + HORN_LIP, LINK_SIDE, 6]));
}

function frameOf(arm: SizedArm): Map<string, string> {
  const frames = new Map<string, string>();

  for (const j of arm.template.joints) {
    frames.set(j.child[0], j.id);
    frames.set(j.actuators?.[0] ?? `${j.id}-servo`, j.id);

    if (!frames.has(j.parent[0])) frames.set(j.parent[0], j.id);
  }

  return frames;
}

export function armParts(arm: SizedArm, { links, prefix }: ArmPartsOptions): PlacedArm {
  const frames = frameOf(arm);
  const group = { id: prefix, name: 'Arm' };
  const servos: AgentPartSpec[] = arm.template.servos.map((s) => ({
    id: `${prefix}-${s.id}`,
    catalog: s.catalog,
    position: s.position as AgentPartSpec['position'],
    rotation: s.rotation as AgentPartSpec['rotation'],
    frame: frames.get(s.id),
  }));
  const printed: AgentPartSpec[] = links
    ? arm.template.parts.map((p) => ({
        id: `${prefix}-${p.id}`,
        name: p.name,
        shape: 'cad_part',
        material: 'printed',
        cad: placeholder(p.code, linkBox(p, arm)),
        position: p.position as AgentPartSpec['position'],
        rotation: p.rotation as AgentPartSpec['rotation'],
        frame: frames.get(p.id),
      }))
    : [];
  const parts = [...printed, ...servos].map((spec) => {
    const part = { ...specToPart(spec), group };

    return part.cad ? { ...part, cad: { ...part.cad, pending: true } } : part;
  });

  return { parts, skeleton: buildSkeleton(arm.skeleton).skeleton };
}
