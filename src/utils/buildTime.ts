import type { HardwareType } from '../data/hardware';
import { isBuilt } from '../guide/guidePlan';
import type { Plate } from '../print/plan';
import { servoLayout } from '../robot/sceneRobot';
import type { RobotJoint, ScenePart } from '../types/robotics';
import type { BuildTimeInput, PlateTime, PrintTime } from './engineeringTypes';
import type { PrintReport } from './printReport';

export const ASSEMBLY_MINUTES = { part: 2, fastener: 1, insert: 1.5 };
export const SERVO_MINUTES = 5;

const FASTENERS = new Set<HardwareType>([
  'socket_head',
  'button_head',
  'countersunk',
  'pan_head',
  'hex_bolt',
  'set_screw',
  'hex_nut',
  'lock_nut',
  'square_nut',
  'washer',
  'large_washer',
  't_nut',
  't_nut_8',
]);

export interface StepTime {
  number: number;
  ids: string[];
  fasteners: number;
  minutes: number;
}

export interface BuildTime {
  printHours: number;
  printers: number;
  assemblyHours: number;
  servos: number;
  servoHours: number;
  totalHours: number;
  longestPlate?: PlateTime;
  busiestStep?: StepTime;
}

export function printTimeOf(
  report: PrintReport,
  o: { printers: number; sliced?: (plate: Plate) => { seconds: number } | undefined },
): PrintTime {
  const plates = report.plan.plates.map((plate) => {
    const sliced = o.sliced?.(plate);

    return {
      number: plate.number,
      hours: sliced ? sliced.seconds / 3600 : plate.hours,
      sliced: !!sliced,
      ids: [...new Set(plate.items.map((i) => i.id))],
    };
  });
  const plated = new Set(plates.flatMap((p) => p.ids));
  const unplatedHours = report.parts.filter((r) => !plated.has(r.id)).reduce((s, r) => s + r.hours * r.copies, 0);

  return { printers: Math.max(1, o.printers), plates, unplatedHours };
}

type PartKind = keyof typeof ASSEMBLY_MINUTES;

function kindOf(p: ScenePart): PartKind {
  const type = p.kind === 'hardware' ? p.hardware?.type : undefined;

  if (type === 'heat_insert') return 'insert';

  return type && FASTENERS.has(type) ? 'fastener' : 'part';
}

function stepTimes(steps: string[][], byId: Map<string, ScenePart>): StepTime[] {
  const counted = new Set<string>();

  return steps.map((ids, i) => {
    const fresh = ids.filter((id) => byId.has(id) && !counted.has(id));

    fresh.forEach((id) => counted.add(id));

    const kinds = fresh.map((id) => kindOf(byId.get(id)!));

    return {
      number: i + 1,
      ids,
      fasteners: kinds.filter((k) => k === 'fastener').length,
      minutes: kinds.reduce((s, k) => s + ASSEMBLY_MINUTES[k], 0),
    };
  });
}

const busiest = (steps: StepTime[]) =>
  steps.reduce<StepTime | undefined>(
    (best, s) =>
      !best || s.fasteners > best.fasteners || (s.fasteners === best.fasteners && s.minutes > best.minutes) ? s : best,
    undefined,
  );

const longest = (plates: PlateTime[]) =>
  plates.reduce<PlateTime | undefined>((best, p) => (!best || p.hours > best.hours ? p : best), undefined);

export function buildTime(input: BuildTimeInput, scene: { parts: ScenePart[]; joints: RobotJoint[] }): BuildTime {
  const built = scene.parts.filter(isBuilt);
  const byId = new Map(built.map((p) => [p.id, p]));
  const assemblyMinutes = built.reduce((s, p) => s + ASSEMBLY_MINUTES[kindOf(p)], 0);
  const plateHours = input.plates.reduce((s, p) => s + p.hours, 0) + input.unplatedHours;
  const printHours = plateHours / input.printers;
  const servos = servoLayout(scene.joints).movable.length;
  const servoHours = (servos * SERVO_MINUTES) / 60;
  const assemblyHours = assemblyMinutes / 60;

  return {
    printHours,
    printers: input.printers,
    assemblyHours,
    servos,
    servoHours,
    totalHours: printHours + assemblyHours + servoHours,
    longestPlate: longest(input.plates),
    busiestStep: busiest(stepTimes(input.steps, byId)),
  };
}
