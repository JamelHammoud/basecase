import type { RobotJoint } from '../types/robotics';
import { jointLabel } from './engineeringFormat';
import { negative } from '../../electron/minus.mjs';
import { plural } from '../../electron/plural.mjs';
import type { CheckContext, CheckRow } from './engineeringTypes';
import { angle } from './angle';

const SLACK_DEG = 0.5;

const sorted = (r: [number, number]): [number, number] => [Math.min(...r), Math.max(...r)];

const whole = (v: number) => String(Math.round(v));

const millimeters = (v: number) => `${negative(v, whole)} mm`;

const show = (j: RobotJoint, [lo, hi]: [number, number]) => {
  const fmt = j.type === 'prismatic' ? millimeters : angle;

  return `${fmt(lo)} to ${fmt(hi)}`;
};

function narrowed(j: RobotJoint, first: [number, number]): string | null {
  const now = sorted(j.range ?? [-180, 180]);
  const was = sorted(first);

  if (now[0] <= was[0] + SLACK_DEG && now[1] >= was[1] - SLACK_DEG) return null;

  return `${jointLabel(j)}: ${show(j, now)}, first defined as ${show(j, was)}. Restore the range and fix what clashes, or tell the user why it changed`;
}

export function rangeChangeRows(ctx: CheckContext): CheckRow[] {
  const first = ctx.project.firstRanges ?? {};
  const tracked = ctx.joints.filter((j) => first[j.id]);

  if (!tracked.length) return [];

  const items = tracked.flatMap((j) => {
    const text = narrowed(j, first[j.id]);

    return text ? [{ text, ids: j.child.slice(0, 1) }] : [];
  });

  return [
    {
      check: 'Range changes',
      status: items.length ? 'warn' : 'pass',
      detail: items.length ? `${plural(items.length, 'joint')} narrower than first defined` : '',
      detailInItems: true,
      items,
    },
  ];
}
