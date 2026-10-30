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

function jointLimits(l: EngineeringReport['joints'][number]): string {
  if (l.stallShare === undefined) return ' (no actuator data)';

  if (l.ratedNm === undefined)
    return ` vs maker limit ${nm(l.stallNm!)} (${Math.round(l.stallShare * 100)}%) ${MARK[l.status]}`;

  const sim = l.simRmsNm === undefined ? '' : ` from ${nm(l.simRmsNm)} N·m RMS in the walk sim`;
  const heat = l.heatShare === undefined ? '' : `, heat ${l.heatShare.toFixed(2)}× rated${sim}`;

  return ` vs stall ${nm(l.stallNm!)} / rated ${nm(l.ratedNm)}${l.ratedEstimated ? ' (estimated)' : ''}${l.volts ? ` at ${l.volts} V` : ''} (${l.stallShare.toFixed(2)} of stall${heat}) ${MARK[l.status]}`;
}

function jointTextLine(l: EngineeringReport['joints'][number], toAgent: (v: V3) => V3): string {
  const o = toAgent(l.joint.origin).map((v) => Math.round(v));
  const crouch = l.crouchNm === undefined ? '' : `, ${l.crouchDeg?.toFixed(0)}° crouch ${nm(l.crouchNm)}`;
  const load = l.kind === 'stance' ? `stance load ${nm(l.loadNm)}` : `holding load ${nm(l.loadNm)}`;

  return (
    `- ${l.joint.id} ${l.joint.name}: carries ${fmtG(l.massG)}; hold ${nm(l.swingNm)}, stance as modeled ${nm(l.stanceNm)}${crouch} → ${load} N·m` +
    jointLimits(l) +
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
      "Joints. Leg joints carry the whole robot on one leg at the gait's crouch (at least 30°): PASS at ≤ 0.40 of stall and walking heat (0.67 × that load, or the RMS measured walking the trained policy when the peak test ran) ≤ rated; WARN to 0.60 of stall and 1.6× rated; FAIL above. Other joints hold their limb across the range: PASS at ≤ 0.40 of stall and ≤ rated, FAIL above 0.60 of stall. Stall is taken at the servo supply voltage; rated is the maker's continuous torque, else 1/4 of stall.",
      ...r.joints.map((l) => jointTextLine(l, toAgent)),
    );
  }

  return lines.join('\n');
}
