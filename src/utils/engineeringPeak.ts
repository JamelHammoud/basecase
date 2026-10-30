import type { ProjectSettings } from '../types/robotics';
import { PEAK_DERATE } from './actuatorRules';
import { count, jointLabel, nm } from './engineeringFormat';
import type { CheckRow, JointLoad, WalkJoint, WalkSim } from './engineeringTypes';
import { peakStatus } from './peakTorque';

interface PeakLine {
  load: JointLoad;
  walk: WalkJoint;
  stallNm: number;
  status: CheckRow['status'];
}

export const peakJoints = (loads: JointLoad[]) =>
  loads.filter((l) => l.kind === 'stance' && l.stallNm !== undefined && l.stallNm > 0);

const loadIds = (l: JointLoad) => (l.joint.actuators?.length ? l.joint.actuators : l.joint.child);

const shareOf = (p: PeakLine) => p.walk.p99Nm / p.stallNm;

function peakLineText(p: PeakLine): string {
  const over = p.walk.overS > 0 ? `, above stall for ${p.walk.overS.toFixed(2)} s` : '';

  return `${jointLabel(p.load.joint)}: asks for ${nm(p.walk.p99Nm)} N·m at the 99th percentile, ${shareOf(p).toFixed(2)} of its ${nm(p.stallNm)} N·m stall${over}`;
}

function notRun(loads: JointLoad[], project: ProjectSettings, reason?: string): CheckRow[] {
  if (!peakJoints(loads).length) return [];

  const walking = project.policies?.some((p) => p.task === 'walk');
  const fallback = walking
    ? 'Measured only when the trained walk policy runs in simulation'
    : 'Needs a trained walk policy: landing loads come from walking, not standing';

  return [{ check: 'Peak torque', status: 'not run', detail: reason ?? fallback }];
}

function fellRow(walk: WalkSim, lines: PeakLine[]): CheckRow {
  return {
    check: 'Peak torque',
    status: 'fail',
    detail: `Fell at ${walk.fellAt!.toFixed(1)} s walking with servos limited to ${PEAK_DERATE} × stall`,
    items: lines.map((p) => ({ text: peakLineText(p), ids: loadIds(p.load) })),
    ids: lines.flatMap((p) => loadIds(p.load)),
  };
}

function measuredDetail(lines: PeakLine[], fails: PeakLine[], warns: PeakLine[]): string {
  if (fails.length) return `${count(fails.length, 'joint')} past stall while walking`;

  if (warns.length) return `${count(warns.length, 'joint')} with thin margins while walking`;

  const worst = [...lines].sort((a, b) => shareOf(b) - shareOf(a))[0];

  return `Worst: ${jointLabel(worst.load.joint)}, ${shareOf(worst).toFixed(2)} of stall at the 99th percentile`;
}

function worstStatus(fails: PeakLine[], warns: PeakLine[]): CheckRow['status'] {
  if (fails.length) return 'fail';

  return warns.length ? 'warn' : 'pass';
}

function measuredRow(lines: PeakLine[]): CheckRow {
  const fails = lines.filter((p) => p.status === 'fail');
  const warns = lines.filter((p) => p.status === 'warn');
  const flagged = [...fails, ...warns];

  return {
    check: 'Peak torque',
    status: worstStatus(fails, warns),
    detail: measuredDetail(lines, fails, warns),
    items: flagged.map((p) => ({ text: peakLineText(p), ids: loadIds(p.load) })),
    ids: flagged.flatMap((p) => loadIds(p.load)),
  };
}

export function peakRow(loads: JointLoad[], project: ProjectSettings, walk?: WalkSim | string): CheckRow[] {
  if (typeof walk !== 'object') return notRun(loads, project, walk);

  const lines = peakJoints(loads).flatMap((load): PeakLine[] => {
    const w = walk.joints[load.joint.id];

    return w ? [{ load, walk: w, stallNm: load.stallNm!, status: peakStatus(w, load.stallNm!) }] : [];
  });

  if (!lines.length) return notRun(loads, project, 'The walk policy drives none of the leg joints');

  return walk.fellAt === null ? [measuredRow(lines)] : [fellRow(walk, lines)];
}
