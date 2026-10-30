import { count, jointLabel, nm } from './engineeringFormat';
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
  if (fails.length) return `${count(fails.length, 'joint')} overloaded`;

  if (warns.length) return `${count(warns.length, 'joint')} with thin margins`;

  const worst = worstOf(loads);

  if (!worst) return `No torque data for ${count(unknown.length, 'joint')}`;

  const where = worst.kind === 'stance' ? stanceWords(worst, legs) : 'holding';

  return `Worst: ${jointLabel(worst.joint)}, ${share(worst.stallShare)} of stall ${where}`;
}

function torqueStatus({ fails, warns, unknown }: TorqueSummary): CheckRow['status'] {
  if (fails.length) return 'fail';

  return unknown.length || warns.length ? 'warn' : 'pass';
}

function torqueItems(s: TorqueSummary): NonNullable<CheckRow['items']> {
  const line = (l: JointLoad) => ({ text: loadText(l, s.legs), ids: loadIds(l) });
  const partlyUnknown = s.unknown.length && s.unknown.length < s.loads.length;

  return [
    ...s.fails.map(line),
    ...s.warns.map(line),
    ...(partlyUnknown
      ? [
          {
            text: `No torque data for ${count(s.unknown.length, 'joint')}: give them servos`,
            ids: s.unknown.flatMap((l) => l.joint.child),
          },
        ]
      : []),
  ];
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
