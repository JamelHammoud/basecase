import type { MainModule } from '@mujoco/mujoco';
import type { SimModel } from '../sim/mjcfTypes';
import type { Skill } from './artifacts';
import type { Environment, RewardRef } from './environment';
import type { ForgeRunner, SkillSave } from './forgeRunner';
import type { V3 } from './kitModel';
import type { Waypoint } from './raceIk';
import type { Method, Route, TaskAnalysis } from './router';

export type RaceGoal = { kind: 'reach'; part: string; waypoints: Waypoint[] } | { kind: 'velocity'; command: V3 };

export interface RaceTask {
  id: string;
  design: string;
  model: SimModel;
  environment: Environment;
  analysis: TaskAnalysis;
  goal: RaceGoal;
}

export interface RaceCost {
  wallS: number;
  steps: number;
}

export interface RaceCandidate {
  reward: RewardRef;
  steps: number;
  arenaPassed: boolean | null;
}

export interface RaceAttempt {
  method: Method;
  passed: boolean;
  cost: RaceCost;
  reason: string;
  candidates: RaceCandidate[];
}

export type RaceOutcome =
  | { kind: 'skill'; skill: Skill; method: Method; route: Route; cost: RaceCost; attempts: RaceAttempt[] }
  | { kind: 'not-found'; route: Route; cost: RaceCost; attempts: RaceAttempt[]; reason: string };

export interface RaceInput {
  mj: MainModule;
  task: RaceTask;
  forge: ForgeRunner;
  save: SkillSave;
  rewardCandidates?: string[];
  robustnessCandidate?: boolean;
  budgetSteps?: number;
  signal?: AbortSignal;
}

export interface SolveResult {
  skill: Skill | null;
  attempt: RaceAttempt;
}

export interface RaceClock {
  started: number;
  steps: number;
}

export const elapsedOf = (clock: RaceClock): RaceCost => ({
  wallS: (performance.now() - clock.started) / 1000,
  steps: clock.steps,
});
