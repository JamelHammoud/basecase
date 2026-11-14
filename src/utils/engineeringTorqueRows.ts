import { jointLabel } from './engineeringFormat';
import { torque } from './torque';
import { plural } from '../../electron/plural.mjs';
import { angle } from './angle';
import type { CheckRow, FindingFix, JointLoad } from './engineeringTypes';

export type TorqueOffers = (l: JointLoad) => { fix?: FindingFix; why?: string };

const share = (v: number | undefined) => (v === undefined ? '?' : v.toFixed(2));

const loadIds = (l: JointLoad) => (l.joint.actuators?.length ? l.joint.actuators : l.joint.child);

const isPublished = (l: JointLoad) => !l.joint.actuators?.length && !!l.joint.effortNm;

function stanceWords(l: JointLoad, legs: string): string {
  const crouch = l.crouchNm !== undefined && l.crouchNm >= l.stanceNm;

  return crouch ? `${legs} at a ${angle(l.crouchDeg!)} crouch` : `${legs} as modeled`;
}

const heatSource = (l: JointLoad) =>
  l.simRmsNm === undefined ? 'in walking heat' : `walking (${torque(l.simRmsNm)} RMS in simulation)`;

export function loadText(l: JointLoad, legs = 'on one leg'): string {
  const name = jointLabel(l.joint);

  if (isPublished(l)) return `${name}: needs ${torque(l.loadNm)} of its ${torque(l.joint.effortNm!)} limit`;

  const volts = l.volts ? ` at ${Math.round(l.volts * 10) / 10} V` : '';
  const rated = l.ratedEstimated ? ' (rated taken as 1/4 of stall)' : '';
  const heat = l.kind === 'stance' ? `${share(l.heatShare)}× rated ${heatSource(l)}` : `${share(l.heatShare)}× rated`;
  const what = l.kind === 'stance' ? `${torque(l.loadNm)} ${stanceWords(l, legs)}` : `holds up to ${torque(l.loadNm)}`;

  return `${name}: ${what}, ${share(l.stallShare)} of its ${torque(l.stallNm!)} stall${volts}, ${heat}${rated}`;
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

function torqueItems(s: TorqueSummary, offers?: TorqueOffers): NonNullable<CheckRow['items']> {
  const line = (l: JointLoad, status: 'warn' | 'fail') => {
    const { fix, why } = offers?.(l) ?? {};
    const text = why ? `${loadText(l, s.legs)}. ${why}` : loadText(l, s.legs);

    return { text, ids: loadIds(l), status, ...(fix ? { fix, joint: l.joint.id } : {}) };
  };

  return [...s.fails.map((l) => line(l, 'fail')), ...s.warns.map((l) => line(l, 'warn'))];
}

export function torqueRow(loads: JointLoad[], legShare = 1, offers?: TorqueOffers): CheckRow {
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
    detailInItems: true,
    items: torqueItems(summary, offers),
    ids: [...summary.fails, ...summary.warns].flatMap(loadIds),
  };
}
