import { jointLabel, nm } from './engineeringFormat';
import { plural } from '../../electron/plural.mjs';
import type { CheckRow, JointLoad } from './engineeringTypes';

const share = (v: number | undefined) => (v === undefined ? '?' : v.toFixed(2));

const loadIds = (l: JointLoad) => (l.joint.actuators?.length ? l.joint.actuators : l.joint.child);

const isPublished = (l: JointLoad) => !l.joint.actuators?.length && !!l.joint.effortNm;

function stanceWords(l: JointLoad, legs: string): string {
  const crouch = l.crouchNm !== undefined && l.crouchNm >= l.stanceNm;

  return crouch ? `${legs} at a ${Math.round(l.crouchDeg!)}° crouch` : `${legs} as modeled`;
}

const heatSource = (l: JointLoad) =>
  l.simRmsNm === undefined ? 'in walking heat' : `walking (${nm(l.simRmsNm)} N·m RMS in simulation)`;

export function loadText(l: JointLoad, legs = 'on one leg'): string {
  const name = jointLabel(l.joint);

  if (isPublished(l)) return `${name}: needs ${nm(l.loadNm)} N·m of its ${nm(l.joint.effortNm!)} N·m limit`;

  const volts = l.volts ? ` at ${Math.round(l.volts * 10) / 10} V` : '';
  const rated = l.ratedEstimated ? ' (rated taken as 1/4 of stall)' : '';
  const heat = l.kind === 'stance' ? `${share(l.heatShare)}× rated ${heatSource(l)}` : `${share(l.heatShare)}× rated`;
  const what = l.kind === 'stance' ? `${nm(l.loadNm)} N·m ${stanceWords(l, legs)}` : `holds up to ${nm(l.loadNm)} N·m`;

  return `${name}: ${what}, ${share(l.stallShare)} of its ${nm(l.stallNm!)} N·m stall${volts}, ${heat}${rated}`;
}

interface TorqueSummary {
  loads: JointLoad[];
  fails: JointLoad[];
  warns: JointLoad[];
  unknown: JointLoad[];
  legs: string;
}

function worstOf(loads: JointLoad[]): JointLoad | undefined {
  const known = loads.filter((l) => l.stallShare !== undefined);

  return known.sort((x, y) => y.stallShare! - x.stallShare!)[0];
}

function torqueDetail({ loads, fails, warns, unknown, legs }: TorqueSummary): string {
  if (fails.length) return `${plural(fails.length, 'joint')} overloaded`;

  if (warns.length) return `${plural(warns.length, 'joint')} with thin margins`;

  const worst = worstOf(loads);

  if (!worst) return `No torque data for ${plural(unknown.length, 'joint')}`;

  const where = worst.kind === 'stance' ? stanceWords(worst, legs) : 'holding';

  return `Worst: ${jointLabel(worst.joint)}, ${share(worst.stallShare)} of stall ${where}`;
}

function torqueStatus({ loads, fails, warns, unknown }: TorqueSummary): CheckRow['status'] {
  if (fails.length) return 'fail';

  if (warns.length) return 'warn';

  return unknown.length === loads.length ? 'not run' : 'pass';
}

function torqueItems(s: TorqueSummary): NonNullable<CheckRow['items']> {
  const line = (l: JointLoad, status: 'warn' | 'fail') => ({ text: loadText(l, s.legs), ids: loadIds(l), status });

  return [...s.fails.map((l) => line(l, 'fail')), ...s.warns.map((l) => line(l, 'warn'))];
}

export function torqueRow(loads: JointLoad[], legShare = 1): CheckRow {
  const summary: TorqueSummary = {
    loads,
    fails: loads.filter((l) => l.status === 'fail'),
    warns: loads.filter((l) => l.status === 'warn'),
    unknown: loads.filter((l) => l.status === 'not run'),
    legs: legShare < 1 ? 'on two legs' : 'on one leg',
  };

  return {
    check: 'Servo torque',
    status: torqueStatus(summary),
    detail: torqueDetail(summary),
    items: torqueItems(summary),
    ids: [...summary.fails, ...summary.warns].flatMap(loadIds),
  };
}
