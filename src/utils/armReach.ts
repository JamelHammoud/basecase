import { ARM_SHOULDER_Z, ARM_TOOL, armTemplate } from '../../electron/cad-mcp/recipes/templates.mjs';
import type { ZUpVec } from '../types/skeleton';

export const ARM_JOINTS = ['base_yaw', 'shoulder_pitch', 'elbow_pitch', 'wrist_pitch'] as const;

export type ArmJoint = (typeof ARM_JOINTS)[number];

export type ArmAngles = Record<ArmJoint, number>;

export interface ArmShape {
  links: [number, number, number];
  baseHeight: number;
  base: ZUpVec;
  yaw: number;
}

export const JOINT_MARGIN = 0.1;

const SLACK_DEG = 0.5;
const PHI_STEP_DEG = 2;
const DEG = Math.PI / 180;

const TOOL_REACH = ARM_TOOL.x;
const TOOL_SIDE = -ARM_TOOL.z;

export function innerRange([lo, hi]: [number, number]): [number, number] {
  const keep = (hi - lo) * JOINT_MARGIN;

  return [lo + keep, hi - keep];
}

const RANGES = new Map(armTemplate().joints.map((j) => [j.id, j.range]));

const halfWidth = (id: ArmJoint) => {
  const [lo, hi] = innerRange(RANGES.get(id)!);

  return Math.min(-lo, hi) - SLACK_DEG;
};

const LIMITS: ArmAngles = {
  base_yaw: halfWidth('base_yaw'),
  shoulder_pitch: halfWidth('shoulder_pitch'),
  elbow_pitch: halfWidth('elbow_pitch'),
  wrist_pitch: halfWidth('wrist_pitch'),
};

export const wrapDeg = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;

export interface PlanarTarget {
  yaw: number;
  u: number;
  w: number;
}

export function shoulderHeight(shape: Pick<ArmShape, 'baseHeight' | 'base'>): number {
  return shape.base[2] + ARM_SHOULDER_Z + shape.baseHeight;
}

export function planarTargets(shape: Pick<ArmShape, 'base' | 'yaw'>, at: ZUpVec): PlanarTarget[] {
  const c = Math.cos(-shape.yaw * DEG);
  const s = Math.sin(-shape.yaw * DEG);
  const dx = at[0] - shape.base[0];
  const dy = at[1] - shape.base[1];
  const x = dx * c - dy * s;
  const y = dx * s + dy * c;
  const across = x * x + y * y - TOOL_SIDE * TOOL_SIDE;

  if (across < 0) return [];

  const out = Math.sqrt(across);
  const options = out > 1e-6 ? [out, -out] : [0];

  return options.flatMap((u) => {
    const yaw = wrapDeg((Math.atan2(y, x) - Math.atan2(-u, TOOL_SIDE)) / DEG);

    return Math.abs(yaw) <= LIMITS.base_yaw ? [{ yaw, u, w: at[2] }] : [];
  });
}

type Pitches = Omit<ArmAngles, 'base_yaw'>;

interface WristCentre {
  cx: number;
  cw: number;
  phi: number;
}

function elbowSolutions({ cx, cw, phi }: WristCentre, l2: number, l3: number): Pitches | null {
  const cos = (cx * cx + cw * cw - l2 * l2 - l3 * l3) / (2 * l2 * l3);

  if (Math.abs(cos) > 1) return null;

  for (const sign of [1, -1]) {
    const elbow = (sign * Math.acos(cos)) / DEG;
    const shoulder =
      (Math.atan2(cw, cx) - Math.atan2(l3 * Math.sin(elbow * DEG), l2 + l3 * Math.cos(elbow * DEG))) / DEG;
    const wrist = wrapDeg(phi - shoulder - elbow);
    const fits =
      Math.abs(elbow) <= LIMITS.elbow_pitch &&
      Math.abs(shoulder) <= LIMITS.shoulder_pitch &&
      Math.abs(wrist) <= LIMITS.wrist_pitch;

    if (fits) return { shoulder_pitch: shoulder, elbow_pitch: elbow, wrist_pitch: wrist };
  }

  return null;
}

export function planarReach(du: number, dw: number, l2: number, l3: number): Pitches | null {
  const toward = Math.atan2(dw, du) / DEG;

  for (let k = 0; k <= 180 / PHI_STEP_DEG; k++) {
    const phi = toward + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * PHI_STEP_DEG;
    const cx = du - TOOL_REACH * Math.cos(phi * DEG);
    const cw = dw - TOOL_REACH * Math.sin(phi * DEG);
    const solved = elbowSolutions({ cx, cw, phi }, l2, l3);

    if (solved) return solved;
  }

  return null;
}

export function shoulderDistance(shape: Pick<ArmShape, 'links' | 'baseHeight' | 'base'>, t: PlanarTarget): number {
  return Math.hypot(t.u - shape.links[0], t.w - shoulderHeight(shape));
}

export const reachLimit = (l2: number, l3: number) => l2 + l3 + TOOL_REACH;

export function anglesTo(shape: ArmShape, at: ZUpVec): ArmAngles | null {
  const [l1, l2, l3] = shape.links;
  const height = shoulderHeight(shape);

  for (const t of planarTargets(shape, at)) {
    const pitches = planarReach(t.u - l1, t.w - height, l2, l3);

    if (pitches) return { base_yaw: t.yaw, ...pitches };
  }

  return null;
}

export function armTool(shape: ArmShape, angles: ArmAngles): ZUpVec {
  const [l1, l2, l3] = shape.links;
  const a1 = angles.shoulder_pitch * DEG;
  const a2 = a1 + angles.elbow_pitch * DEG;
  const a3 = a2 + angles.wrist_pitch * DEG;
  const u = l1 + l2 * Math.cos(a1) + l3 * Math.cos(a2) + TOOL_REACH * Math.cos(a3);
  const w = shoulderHeight(shape) + l2 * Math.sin(a1) + l3 * Math.sin(a2) + TOOL_REACH * Math.sin(a3);
  const yaw = (shape.yaw + angles.base_yaw) * DEG;
  const x = TOOL_SIDE * Math.cos(yaw) + u * Math.sin(yaw);
  const y = TOOL_SIDE * Math.sin(yaw) - u * Math.cos(yaw);

  return [shape.base[0] + x, shape.base[1] + y, w];
}
