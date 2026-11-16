import { plural } from '../../electron/plural.mjs';
import { isFastener, isInsert } from '../guide/guideItems';
import { isBuilt } from '../guide/guidePlan';
import { guideStepParts } from '../guide/guideSteps';
import type { SlicedPlate } from '../print/printBridge';
import { sliceLookup } from '../print/slices';
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
  assemblySteps?: string[][];
}

export const TIME_MINUTES = { step: 1, part: 2, fastener: 0.5, insert: 1.5, servo: 5 };

function longestPlate<T extends { hours: number }>(plates: T[]): T | undefined {
  let longest: T | undefined;

  for (const plate of plates) {
    if (Number.isNaN(plate.hours)) return [...plates].sort((a, b) => b.hours - a.hours)[0];

    if (!longest || plate.hours > longest.hours) longest = plate;
  }

  return longest;
}

function fastenerStep<T extends { fasteners: number; minutes: number }>(steps: T[]): T | undefined {
  let most: T | undefined;

  for (const step of steps) {
    const order = most ? step.fasteners - most.fasteners || step.minutes - most.minutes : 1;

    if (order > 0) most = step;
  }

  return most;
}

export function assemblyTimes(parts: ScenePart[], project: ProjectSettings, steps = guideStepParts(parts, project)) {
  const byId = new Map<string, ScenePart>();

  for (const part of parts) {
    if (isBuilt(part)) byId.set(part.id, part);
  }

  const counted = new Set<string>();

  return steps.map((ids, index) => {
    const fresh: string[] = [];
    let fasteners = 0;
    let inserts = 0;

    for (const id of ids) {
      const part = byId.get(id);

      if (!part || counted.has(id)) continue;

      fresh.push(part.id);
      fasteners += Number(isFastener(part));
      inserts += Number(isInsert(part));
    }

    for (const id of fresh) counted.add(id);

    const pieces = fresh.length - fasteners - inserts;
    const minutes =
      TIME_MINUTES.step +
      pieces * TIME_MINUTES.part +
      fasteners * TIME_MINUTES.fastener +
      inserts * TIME_MINUTES.insert;

    return { step: index + 1, minutes, fasteners, inserts, ids: fresh };
  });
}

export function buildTime(input: TimeInput) {
  const { parts, project, print, slices = [] } = input;
  const printers = Math.max(1, Math.floor(input.printerCount ?? 1));
  const slicedPlate = sliceLookup(slices, (s) => Number.isFinite(s.seconds) && s.seconds >= 0);
  const plates = (print?.plan.plates ?? []).map((plate) => {
    const sliced = slicedPlate(plate);

    return {
      number: plate.number,
      hours: sliced ? sliced.seconds / 3600 : plate.hours,
      estimated: plate.hours,
      ids: [...new Set(plate.items.map((p) => p.id))],
    };
  });
  const unplaced = Math.max(0, (print?.totals.hours ?? 0) - plates.reduce((n, p) => n + p.estimated, 0));
  const printHours = (plates.reduce((n, p) => n + p.hours, 0) + unplaced) / printers;
  const steps = assemblyTimes(parts, project, input.assemblySteps);
  const assemblyMinutes = steps.reduce((n, s) => n + s.minutes, 0);
  const servos = servoLayout(project.joints ?? []).ids.length;
  const setupMinutes = servos * TIME_MINUTES.servo;
  const longest = longestPlate(plates);
  const mostFasteners = fastenerStep(steps);

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
    'Merge compatible printed parts in Print mode or replace a printed part with a referenceable catalog part. Preserve the robot’s function and strength. Keep each edit in one undo step, then recheck.';

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
