import { toCad } from '../agent/agentScene';
import type { JointAxes, JointCandidate, LoneFace } from '../joints/jointCandidates';
import type { RobotJoint, ScenePart } from '../types/robotics';
import type { Vec3 } from './types';
import { plural } from '../../electron/plural.mjs';

export interface JointAxesContext {
  parts: () => ScenePart[];
  joints: () => RobotJoint[];
  jointAxes: (ids: string[]) => Promise<JointAxes>;
}

const axisText = (v: Vec3) => `[${toCad(v).map((x) => (Math.round(x * 1000) / 1000).toFixed(3))}]`;
const pointText = (v: Vec3) => `[${toCad(v).map((x) => Math.round(x * 10) / 10)}]`;
const mm = (v: number) => Math.round(v * 10) / 10;

const rigged = (part: ScenePart) => part.visible !== false && (part.role ?? 'solid') === 'solid';

function declaredAs(c: JointCandidate, joints: RobotJoint[]) {
  const hit = joints.find(
    (j) =>
      (j.parent.includes(c.parent) && j.child.includes(c.child)) ||
      (j.parent.includes(c.child) && j.child.includes(c.parent)),
  );

  return hit ? ` (declared as ${hit.id})` : '';
}

function candidateLine(c: JointCandidate, joints: RobotJoint[]) {
  const held = c.pin ? `pin ${c.pin} through bores in both` : `shaft on ${c.shaftOn} in a bore of the other`;

  return (
    `- ${c.parent} → ${c.child}: axis ${axisText(c.axis)} through ${pointText(c.origin)}; ` +
    `${held}, Ø${mm(c.radius * 2)}, ${mm(c.engaged)} mm engaged; slides ${c.travel[0]} to ${c.travel[1]} mm; ` +
    `confidence ${c.confidence}${declaredAs(c, joints)}`
  );
}

const faceLine = (f: LoneFace) =>
  `- ${f.part}: ${f.bore ? 'bore' : 'shaft'} Ø${mm(f.radius * 2)}, axis ${axisText(f.axis)} through ${pointText(f.origin)}`;

export function jointAxesText(found: JointAxes, { count, joints }: { count: number; joints: RobotJoint[] }) {
  const lines = found.candidates.length
    ? [
        `${plural(found.candidates.length, 'joint axis', 'joint axes')} among ${plural(count, 'part')} (mm, z up); parent is the side nearer the base:`,
        ...found.candidates.map((c) => candidateLine(c, joints)),
      ]
    : [`No shaft turns in a bore among ${plural(count, 'part')}.`];

  if (found.fastened.length)
    lines.push(`Held by two or more pins, so fixed: ${found.fastened.map((p) => p.join(' + ')).join('; ')}.`);

  if (found.faces.length) lines.push('Round faces with no partner:', ...found.faces.map(faceLine));

  if (found.candidates.length)
    lines.push(
      'A pin goes on one side of its joint. Declare the joints with define_joints (origin, axis, range), ' +
        'then animate each across its range and fix what collides before you report.',
    );

  return lines.join('\n');
}

const cad = (v: Vec3) => toCad(v).map((x) => Math.round(x * 1000) / 1000 + 0) as Vec3;

export async function findJointAxes(payload: { ids?: string[] }, ctx: JointAxesContext) {
  const known = new Set(ctx.parts().map((p) => p.id));
  const ids = payload.ids?.length
    ? payload.ids
    : ctx
        .parts()
        .filter(rigged)
        .map((p) => p.id);
  const missing = ids.filter((id) => !known.has(id));

  if (missing.length) return { text: `No parts named ${missing.join(', ')}.` };

  const found = await ctx.jointAxes(ids);

  return {
    text: jointAxesText(found, { count: ids.length, joints: ctx.joints() }),
    data: {
      candidates: found.candidates.map((c) => ({ ...c, axis: cad(c.axis), origin: cad(c.origin) })),
      fastened: found.fastened,
      faces: found.faces.map((f) => ({ ...f, axis: cad(f.axis), origin: cad(f.origin) })),
    },
  };
}
