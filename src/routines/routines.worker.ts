/// <reference lib="webworker" />
import { type MainModule } from '@mujoco/mujoco';
import { loadMujoco } from '../sim/loadMujoco';
import type { Skill } from '../skills/artifacts';
import type { DriveSetup } from '../sim/drive';
import type { SimModel } from '../sim/mjcfTypes';
import type { RobotJoint } from '../types/robotics';
import { generateScenarios } from './generate';
import { kitForModel, type RoutineKit } from './physicsKit';
import { runPhysics, type PhysicsScenarioResult } from './physicsRun';
import type { Plan } from './planTypes';
import { runScenario } from './scenario';
import type { Scenario } from './scenarioTypes';
import { errorMessage } from '../utils/errorMessage';

export interface ScenarioOutcome {
  covers: string;
  passed: boolean;
  failures: string[];
}

export type RoutinesRequest =
  | { type: 'kit'; model: SimModel; joints: RobotJoint[]; skills: Skill[]; drive: DriveSetup | null }
  | { type: 'test'; plan: Plan }
  | { type: 'physics'; plan: Plan; scenario: Scenario; model: SimModel; joints: RobotJoint[]; kit: RoutineKit };

export type RoutinesResponse =
  | { type: 'kit'; kit: RoutineKit }
  | { type: 'test'; scenarios: ScenarioOutcome[] }
  | { type: 'physics'; result: PhysicsScenarioResult }
  | { type: 'error'; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let mj: MainModule | null = null;

async function testPlan(plan: Plan): Promise<ScenarioOutcome[]> {
  const outcomes: ScenarioOutcome[] = [];

  for (const scenario of generateScenarios(plan)) {
    const r = await runScenario(plan, scenario);

    outcomes.push({ covers: scenario.covers, passed: r.passed, failures: r.failures });
  }

  return outcomes;
}

async function handle(msg: RoutinesRequest): Promise<RoutinesResponse> {
  if (msg.type === 'test') return { type: 'test', scenarios: await testPlan(msg.plan) };

  mj ??= await loadMujoco();

  if (msg.type === 'kit') return { type: 'kit', kit: kitForModel({ mj, ...msg }) };

  return { type: 'physics', result: await runPhysics({ mj, ...msg }) };
}

ctx.onmessage = async (ev: MessageEvent<RoutinesRequest>) => {
  try {
    ctx.postMessage(await handle(ev.data));
  } catch (e) {
    ctx.postMessage({ type: 'error', message: errorMessage(e) } satisfies RoutinesResponse);
  }
};
