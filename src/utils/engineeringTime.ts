import { plural } from '../../electron/plural.mjs';
import { buildTime, type BuildTime, type StepTime } from './buildTime';
import { duration } from './duration';
import type { CheckContext, CheckRow } from './engineeringTypes';

export const TIME_CHECK = 'Time';

const WARN_SHARE = 0.9;

const span = (hours: number) => duration(hours * 3600, 'min');

function breakdown(t: BuildTime): string {
  const onPrinters = t.printers > 1 ? ` on ${plural(t.printers, 'printer')}` : '';

  return [
    t.printHours > 0 ? `print ${span(t.printHours)}${onPrinters}` : '',
    t.assemblyHours > 0 ? `assembly ${span(t.assemblyHours)}` : '',
    t.servos > 0 ? `${plural(t.servos, 'servo')} ${span(t.servoHours)}` : '',
  ]
    .filter(Boolean)
    .join(', ');
}

const stepText = (step: StepTime) =>
  `Step ${step.number}: ${step.fasteners ? `${plural(step.fasteners, 'fastener')}, ` : ''}${span(step.minutes / 60)}`;

function contributors(t: BuildTime, servoIds: string[]): NonNullable<CheckRow['items']> {
  const { longestPlate: plate, busiestStep: step } = t;

  return [
    ...(plate ? [{ text: `Plate ${plate.number}: ${span(plate.hours)}`, ids: plate.ids }] : []),
    ...(step ? [{ text: stepText(step), ids: step.ids }] : []),
    ...(t.servos ? [{ text: `${plural(t.servos, 'servo')}: ${span(t.servoHours)}`, ids: servoIds }] : []),
  ];
}

function statusOf(totalHours: number, budget: number): CheckRow['status'] {
  if (totalHours > budget) return 'fail';

  return totalHours > WARN_SHARE * budget ? 'warn' : 'pass';
}

export function timeRows(ctx: CheckContext): CheckRow[] {
  const input = ctx.input.time;

  if (!input) return [];

  const t = buildTime(input, { parts: ctx.parts, joints: ctx.joints });
  const budget = ctx.project.budgetHours;
  const parts = breakdown(t);
  const total = `≈ ${span(t.totalHours)}${budget === undefined ? '' : ` of ${budget} h`}`;
  const detail = parts ? `${total}: ${parts}` : total;

  if (budget === undefined) return [{ check: TIME_CHECK, status: 'not run', detail }];

  const status = statusOf(t.totalHours, budget);

  return [
    {
      check: TIME_CHECK,
      status,
      detail,
      itemsAreContext: true,
      items:
        status === 'pass'
          ? []
          : contributors(
              t,
              ctx.servos.map((p) => p.id),
            ),
    },
  ];
}
