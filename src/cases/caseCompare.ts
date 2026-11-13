import type { MeshMeasure } from '../three/meshMeasure';
import type { ProjectSettings, PurchaseRecord, ScenePart } from '../types/robotics';
import { buildBom } from '../utils/bom';
import { robotWeight } from '../utils/engineering';
import { buildRig } from '../utils/kinematics';
import type { CaseRuns } from './caseRuns';
import { robotFacts, slotRefusal } from './robotFit';
import { caseSlots, type Case } from './schema';
import type { SlotRobot } from './slots';

export interface CompareRobot {
  tabId: string;
  name: string;
  parts: ScenePart[];
  project: ProjectSettings;
  measures: Record<string, MeshMeasure | undefined>;
  partTriangles: (id: string) => Float32Array | null;
}

export interface ComparedRobot {
  tabId: string;
  name: string;
  runs: CaseRuns;
  costUsd: number;
  massG: number;
}

export interface Comparison {
  caseId: string;
  robots: ComparedRobot[];
  better: string | null;
}

export interface CompareOptions {
  runs: (robot: CompareRobot) => Promise<CaseRuns>;
  purchases: Record<string, PurchaseRecord>;
}

export const comparable = (kase: Case) => caseSlots(kase).length === 1;

export function fitsCase(kase: Case, robot: SlotRobot): boolean {
  const slots = caseSlots(kase);

  if (slots.length !== 1 || !robot.joints.length) return false;

  return !slotRefusal(slots[0], robotFacts(buildRig(robot.joints, robot.parts), robot.parts));
}

export const comparableRobots = <T extends SlotRobot>(kase: Case, robots: T[]): T[] =>
  robots.filter((robot) => fitsCase(kase, robot));

export function robotTotals(
  robot: Pick<CompareRobot, 'parts' | 'project' | 'measures'>,
  purchases: CompareOptions['purchases'],
) {
  const { parts, project, measures } = robot;

  return {
    costUsd: buildBom({ parts, project, purchases, measures }).totals.estimatedUsd,
    massG: robotWeight({ parts, project, measures }).all.grams,
  };
}

const passRate = (runs: CaseRuns) => (runs.runs && !runs.refusal ? runs.passes / runs.runs : 0);

export function betterOf(robots: ComparedRobot[]): string | null {
  const best = Math.max(...robots.map((r) => passRate(r.runs)));
  const top = robots.filter((r) => passRate(r.runs) === best);

  return top.length === 1 ? top[0].tabId : null;
}

export async function compareCase(kase: Case, robots: CompareRobot[], options: CompareOptions): Promise<Comparison> {
  const compared = await Promise.all(
    robots.map(async (robot) => ({
      tabId: robot.tabId,
      name: robot.name,
      runs: await options.runs(robot),
      ...robotTotals(robot, options.purchases),
    })),
  );

  return { caseId: kase.id, robots: compared, better: betterOf(compared) };
}
