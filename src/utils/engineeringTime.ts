import { buildTime, type BuildTime } from './buildTime';
import { duration } from './duration';
import type { CheckContext, CheckRow } from './engineeringTypes';
import { plural } from '../../electron/plural.mjs';

export const TIME_CHECK = 'Time';

const WARN_SHARE = 0.9;
const NAMED_PARTS = 3;

export const hoursText = (hours: number) => (hours > 0 ? duration(hours * 3600, 'min') : '0 min');

const budgetText = (hours: number) => `${Math.round(hours * 10) / 10} h`;

function splitText(t: BuildTime): string {
  return [
    t.printHours > 0 ? `printing ${hoursText(t.printHours)}` : '',
    t.assemblyHours > 0 ? `assembly ${hoursText(t.assemblyHours)}` : '',
    t.setupHours > 0 ? `servo set-up ${hoursText(t.setupHours)}` : '',
  ]
    .filter(Boolean)
    .join(', ');
}

const named = (ids: string[], ctx: CheckContext) =>
  [...new Set(ids.map((id) => ctx.byPart.get(id)?.name ?? id))].slice(0, NAMED_PARTS).join(', ');

function longestPlate(t: BuildTime, printers: number): string {
  const longest = [...t.plates].sort((a, b) => b.hours - a.hours)[0];

  if (!longest) return '';

  const { plate } = longest;
  const names = [...new Set(plate.items.map((i) => i.name))].slice(0, NAMED_PARTS).join(', ');
  const source = longest.sliced ? 'sliced' : 'estimated';

  return `plate ${plate.number} (${plate.material}, ${names}) prints for ${hoursText(longest.hours)} (${source}), of ${plural(t.plates.length, 'plate')} on ${plural(Math.max(1, printers), 'printer')}`;
}

function busiestStep(t: BuildTime, ctx: CheckContext): string {
  const step = [...t.steps].sort((a, b) => b.fasteners - a.fasteners || b.minutes - a.minutes)[0];

  if (!step?.fasteners) return '';

  return `build step ${step.step} drives ${plural(step.fasteners, 'screw or insert', 'screws and inserts')} (${hoursText(step.minutes / 60)}, with ${named(step.partIds, ctx)})`;
}

function biggestText(t: BuildTime, ctx: CheckContext, printers: number): string {
  const servos = t.servos ? `${plural(t.servos, 'servo')} to set up and calibrate (${hoursText(t.setupHours)})` : '';
  const listed = [longestPlate(t, printers), busiestStep(t, ctx), servos].filter(Boolean);

  return listed.length ? ` Biggest: ${listed.join('; ')}.` : '';
}

const HOW_TO_CUT =
  ' Cut time: merge printed parts, make parts that carry no load thinner or hollow, replace a printed part with a catalog part, or use fewer screws. Print time is estimated without a slicer unless plates are sliced. Assembly and set-up are estimates.';

function statusOf(total: number, budget: number): CheckRow['status'] {
  if (total > budget) return 'fail';

  return total > WARN_SHARE * budget ? 'warn' : 'pass';
}

export function timeRows(ctx: CheckContext): CheckRow[] {
  const time = ctx.input.time;

  if (!time) return [];

  const t = buildTime({ parts: ctx.parts, project: ctx.project, time });
  const split = splitText(t);
  const total = `≈ ${hoursText(t.totalHours)}`;
  const budget = ctx.project.budgetHours;

  if (budget === undefined)
    return [{ check: TIME_CHECK, status: 'not run', detail: split ? `${total}: ${split}` : total }];

  const status = statusOf(t.totalHours, budget);
  const over = t.totalHours > budget ? `, ${hoursText(t.totalHours - budget)} over` : '';
  const detail = `${total} of ${budgetText(budget)}${over}${split ? `: ${split}` : ''}`;

  return [
    {
      check: TIME_CHECK,
      status,
      detail,
      ...(status === 'pass' ? {} : { agentText: `${detail}.${biggestText(t, ctx, time.printers)}${HOW_TO_CUT}` }),
    },
  ];
}
