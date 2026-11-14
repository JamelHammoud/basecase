import { isFastener, isInsert } from '../guide/guideItems';
import { firstSteps } from '../guide/guideSteps';
import type { Plate } from '../print/plan';
import { servoLayout } from '../robot/sceneRobot';
import type { ProjectSettings, ScenePart } from '../types/robotics';

export const ASSEMBLY_MINUTES = { part: 2, fastener: 0.75, insert: 1.5 };
export const SERVO_SETUP_MINUTES = 5;

export interface TimeInputs {
  plates: Plate[];
  steps: string[][];
  sliced?: Record<string, number>;
  printers: number;
}

export interface PlateTime {
  plate: Plate;
  hours: number;
  sliced: boolean;
}

export interface StepTime {
  step: number;
  partIds: string[];
  fasteners: number;
  minutes: number;
}

export interface BuildTime {
  plates: PlateTime[];
  printHours: number;
  steps: StepTime[];
  assemblyHours: number;
  servos: number;
  setupHours: number;
  totalHours: number;
}

export function printMakespan(hours: number[], printers: number): number {
  const loads: number[] = new Array(Math.max(1, Math.floor(printers))).fill(0);

  for (const h of [...hours].sort((a, b) => b - a)) {
    const least = loads.indexOf(Math.min(...loads));

    loads[least] += h;
  }

  return Math.max(...loads);
}

function plateTimes(time: TimeInputs): PlateTime[] {
  return time.plates.map((plate) => {
    const sliced = time.sliced?.[plate.hash];

    return sliced === undefined ? { plate, hours: plate.hours, sliced: false } : { plate, hours: sliced, sliced: true };
  });
}

function partMinutes(p: ScenePart): { minutes: number; fastener: boolean } {
  if (isFastener(p)) return { minutes: ASSEMBLY_MINUTES.fastener, fastener: true };

  if (isInsert(p)) return { minutes: ASSEMBLY_MINUTES.insert, fastener: true };

  return { minutes: ASSEMBLY_MINUTES.part, fastener: false };
}

export function stepTimes(parts: ScenePart[], steps: string[][]): StepTime[] {
  const byId = new Map(parts.map((p) => [p.id, p]));
  const out: StepTime[] = steps.map((_, i) => ({ step: i + 1, partIds: [], fasteners: 0, minutes: 0 }));

  for (const [id, index] of firstSteps(steps)) {
    const part = byId.get(id);

    if (!part) continue;

    const { minutes, fastener } = partMinutes(part);
    const step = out[index];

    step.partIds.push(id);
    step.minutes += minutes;
    step.fasteners += fastener ? 1 : 0;
  }

  return out;
}

const sum = (values: number[]) => values.reduce((total, v) => total + v, 0);

export function buildTime(input: { parts: ScenePart[]; project: ProjectSettings; time: TimeInputs }): BuildTime {
  const plates = plateTimes(input.time);
  const printHours = printMakespan(
    plates.map((p) => p.hours),
    input.time.printers,
  );
  const steps = stepTimes(input.parts, input.time.steps);
  const assemblyHours = sum(steps.map((s) => s.minutes)) / 60;
  const servos = servoLayout(input.project.joints ?? []).movable.length;
  const setupHours = (servos * SERVO_SETUP_MINUTES) / 60;

  return {
    plates,
    printHours,
    steps,
    assemblyHours,
    servos,
    setupHours,
    totalHours: printHours + assemblyHours + setupHours,
  };
}
