import { prettyJointName } from './kinematics';
import type { CheckContext, CheckRow, EngineeringReport } from './engineeringTypes';
import type { V3 } from './engineeringMath';
import type { RobotJoint } from '../types/robotics';

export const nm = (v: number) => v.toFixed(2);
export const fmtG = (g: number) => (g >= 1000 ? `${(g / 1000).toFixed(2)} kg` : `${Math.round(g)} g`);
export const deg = (v: number) => `${Math.round(v) < 0 ? '−' : ''}${Math.abs(Math.round(v))}°`;
export const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
export const jointLabel = (j: RobotJoint) => prettyJointName(j.name);
export const partLabel = (ctx: CheckContext, id: string) =>
  `the ${(ctx.byPart.get(id)?.name ?? id).replace(/^\w/, (c) => c.toLowerCase())}`;

const MARK: Record<CheckRow['status'], string> = { pass: 'PASS', warn: 'WARN', fail: 'FAIL', 'not run': 'NOT RUN' };

function jointTextLine(l: EngineeringReport['joints'][number], toAgent: (v: V3) => V3): string {
  const o = toAgent(l.joint.origin).map((v) => Math.round(v));
  const limits =
    l.ratedNm !== undefined
      ? ` vs rated ${nm(l.ratedNm)} / stall ${nm(l.stallNm!)} (${Math.round((l.staticNm / l.stallNm!) * 100)}% of stall) ${MARK[l.status]}`
      : ' (no actuator data)';

  return (
    `- ${l.joint.id} ${l.joint.name}: carries ${fmtG(l.massG)}; hold ${nm(l.swingNm)}, stance ${nm(l.stanceNm)} → ${nm(l.staticNm)} N·m` +
    limits +
    ` · axis through [${o.join(', ')}]`
  );
}

export function engineeringText(r: EngineeringReport, toAgent: (v: V3) => V3): string {
  const lines = r.rows.flatMap((row) => [
    `${MARK[row.status]} · ${row.check}: ${row.detail}`,
    ...(row.items ?? []).map((i) => `    - ${i.text} [${(i.ids ?? []).join(', ')}]`),
  ]);

  if (r.joints.length) {
    lines.push(
      '',
      'Joints (static N·m: worst of holding the distal side across the range and, for legs, standing on that leg; limits are 1/5 of stall for PASS and rated torque for WARN):',
      ...r.joints.map((l) => jointTextLine(l, toAgent)),
    );
  }

  lines.push('', 'Static checks only: walking adds dynamic load, so keep leg joints under 1/5 of stall where you can.');

  return lines.join('\n');
}
