import { plural } from '../../electron/plural.mjs';
import { isFastener, isInsert } from '../guide/guideItems';
import { isBuilt } from '../guide/guidePlan';
import { guideStepParts } from '../guide/guideSteps';
import type { SlicedPlate } from '../print/printBridge';
import { servoLayout } from '../robot/sceneRobot';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import type { CheckRow } from './engineeringTypes';
import type { PrintReport } from './printReport';

export interface TimeInput {
  parts: ScenePart[];
  project: ProjectSettings;
  print?: PrintReport;
  slices?: Array<Pick<SlicedPlate, 'number' | 'hash' | 'seconds'>>;
  printerCount?: number;
}

export const TIME_MINUTES = { step: 1, part: 2, fastener: 0.5, insert: 1.5, servo: 5 };

export function assemblyTimes(parts: ScenePart[], project: ProjectSettings) {
  const byId = new Map(parts.filter(isBuilt).map((p) => [p.id, p]));
  const counted = new Set<string>();

  return guideStepParts(parts, project).map((ids, index) => {
    const fresh = ids.filter((id) => byId.has(id) && !counted.has(id)).map((id) => byId.get(id)!);

    fresh.forEach((p) => counted.add(p.id));

    const fasteners = fresh.filter(isFastener).length;
    const inserts = fresh.filter(isInsert).length;
    const pieces = fresh.length - fasteners - inserts;
    const minutes =
      TIME_MINUTES.step +
      pieces * TIME_MINUTES.part +
      fasteners * TIME_MINUTES.fastener +
      inserts * TIME_MINUTES.insert;

    return { step: index + 1, minutes, fasteners, inserts, ids: fresh.map((p) => p.id) };
  });
}

export function buildTime(input: TimeInput) {
  const { parts, project, print, slices = [] } = input;
  const printers = Math.max(1, Math.floor(input.printerCount ?? 1));
  const plates = (print?.plan.plates ?? []).map((plate) => {
    const sliced = slices.find(
      (s) => s.hash === plate.hash && s.number === plate.number && Number.isFinite(s.seconds) && s.seconds >= 0,
    );

    return {
      number: plate.number,
      hours: sliced ? sliced.seconds / 3600 : plate.hours,
      estimated: plate.hours,
      ids: [...new Set(plate.items.map((p) => p.id))],
    };
  });
  const unplaced = Math.max(0, (print?.totals.hours ?? 0) - plates.reduce((n, p) => n + p.estimated, 0));
  const printHours = (plates.reduce((n, p) => n + p.hours, 0) + unplaced) / printers;
  const steps = assemblyTimes(parts, project);
  const assemblyMinutes = steps.reduce((n, s) => n + s.minutes, 0);
  const servos = servoLayout(project.joints ?? []).ids.length;
  const setupMinutes = servos * TIME_MINUTES.servo;
  const longest = [...plates].sort((a, b) => b.hours - a.hours)[0];
  const mostFasteners = [...steps].sort((a, b) => b.fasteners - a.fasteners || b.minutes - a.minutes)[0];

  return {
    hours: printHours + (assemblyMinutes + setupMinutes) / 60,
    printHours,
    assemblyMinutes,
    setupMinutes,
    servos,
    printers,
    longest,
    mostFasteners,
    steps,
  };
}

export function timeRow(input: TimeInput): CheckRow {
  const time = buildTime(input);
  const budget = input.project.budgetHours;
  const limited = budget !== undefined && Number.isFinite(budget) && budget > 0;
  const status = !limited || time.hours > budget * 0.9 ? 'warn' : 'pass';
  const cap = limited ? ` of ${budget} h` : '';
  const detail = `≈ ${time.hours.toFixed(2)} h${cap}. Printing ${time.printHours.toFixed(2)} h across ${plural(time.printers, 'printer')}, assembly ${time.assemblyMinutes.toFixed(1)} min, servo setup ${time.setupMinutes} min.`;
  const plate = time.longest
    ? `Plate ${time.longest.number}: ${time.longest.hours.toFixed(2)} h (${time.longest.ids.join(', ')}).`
    : '';
  const step = time.mostFasteners
    ? `Step ${time.mostFasteners.step}: ${plural(time.mostFasteners.fasteners, 'fastener')}, ${time.mostFasteners.minutes.toFixed(1)} min (${time.mostFasteners.ids.join(', ')}).`
    : '';
  const fix =
    'Merge compatible printed parts in Print mode, lower infill only on parts that carry no load, or replace a printed part with a referenceable catalog part. Preserve the robot’s function and strength. Keep each edit in one undo step, then recheck.';

  return {
    check: 'Time',
    status: limited && time.hours > budget ? 'fail' : status,
    hours: time.hours,
    detail,
    agentText: [
      detail,
      plate,
      step,
      `${plural(time.servos, 'servo')}: ${time.setupMinutes} min to set up and calibrate.`,
      limited ? fix : 'No time budget set. This estimate is a note.',
    ]
      .filter(Boolean)
      .join(' '),
  };
}
