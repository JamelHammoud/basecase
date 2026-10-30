import type { RobotJoint } from '../types/robotics';
import { count, jointLabel } from './engineeringFormat';
import type { CheckContext, CheckRow } from './engineeringTypes';

const SLACK_DEG = 0.5;

const sorted = (r: [number, number]): [number, number] => [Math.min(...r), Math.max(...r)];

const show = (j: RobotJoint, [lo, hi]: [number, number]) => {
  const unit = j.type === 'prismatic' ? ' mm' : '°';
  const fmt = (v: number) => `${v < 0 ? '−' : ''}${Math.abs(Math.round(v))}${unit}`;

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
      detail: items.length
        ? `${count(items.length, 'joint')} narrower than first defined`
        : 'Every joint keeps the range it was first defined with',
      items,
    },
  ];
}
