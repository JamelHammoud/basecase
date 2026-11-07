export type Method =
  | 'unverifiable'
  | 'ik-or-motion-plan'
  | 'tracking'
  | 'routine'
  | 'lqr-or-mpc'
  | 'tracking-rl-with-reset-curriculum'
  | 'reward-search'
  | 'ask-for-demo'
  | 'not-found';

export interface TaskAnalysis {
  simCanCheck: boolean;
  quasiStatic: boolean;
  motionShapeMatters: boolean;
  kitSkills: string[] | null;
  stateDimension: number;
  contactRich: boolean;
  trajectoryOptimisation: 'not-tried' | 'found-success' | 'no-success';
  rewardSearchRounds: number;
  demo: 'not-asked' | 'asked' | 'given' | 'declined';
}

export interface RewardSearchStage {
  candidates: number;
  steps: number;
}

export interface Route {
  method: Method;
  rung: number;
  reason: string;
  rewardSearch?: { round: number; stages: RewardSearchStage[]; warmStart: boolean };
}

export const LOW_DIMENSION = 12;
export const REWARD_SEARCH_ROUNDS = 3;
export const REWARD_SEARCH_STAGES: readonly RewardSearchStage[] = Object.freeze([
  { candidates: 6, steps: 5_000_000 },
  { candidates: 2, steps: 25_000_000 },
  { candidates: 1, steps: 100_000_000 },
]);

interface Rung {
  method: Method;
  applies: (task: TaskAnalysis) => boolean;
  reason: (task: TaskAnalysis) => string;
}

const RUNGS: Rung[] = [
  {
    method: 'unverifiable',
    applies: (t) => !t.simCanCheck,
    reason: () => 'The simulator can’t check this task, so any result would be unverified.',
  },
  {
    method: 'ik-or-motion-plan',
    applies: (t) => t.quasiStatic,
    reason: () => 'The task is slow enough to plan pose by pose, so no learning is needed.',
  },
  {
    method: 'tracking',
    applies: (t) => t.motionShapeMatters,
    reason: () => 'The shape of the motion is the point, so the robot tracks a reference motion.',
  },
  {
    method: 'routine',
    applies: (t) => (t.kitSkills?.length ?? 0) > 0,
    reason: (t) => `The task chains skills the robot already has: ${(t.kitSkills ?? []).join(', ')}.`,
  },
  {
    method: 'lqr-or-mpc',
    applies: (t) => t.stateDimension <= LOW_DIMENSION && !t.contactRich,
    reason: (t) =>
      `The task has ${t.stateDimension} state values and smooth dynamics, so a model-based controller fits.`,
  },
  {
    method: 'tracking-rl-with-reset-curriculum',
    applies: (t) => t.trajectoryOptimisation === 'found-success',
    reason: () => 'Trajectory optimisation found one success, so the policy learns to track it from easier starts.',
  },
  {
    method: 'reward-search',
    applies: (t) => t.rewardSearchRounds < REWARD_SEARCH_ROUNDS,
    reason: (t) =>
      `Searching rewards, round ${t.rewardSearchRounds + 1} of ${REWARD_SEARCH_ROUNDS}: 6 candidates at 5M steps, 2 at 25M, 1 at 100M.`,
  },
  {
    method: 'ask-for-demo',
    applies: (t) => t.demo === 'not-asked',
    reason: () => 'Reward search ran out. A demo puppeteered with grab and keyframes gives training a start.',
  },
  {
    method: 'not-found',
    applies: () => true,
    reason: () => 'Not found within budget. Try a design relaxation.',
  },
];

export function routeTask(task: TaskAnalysis): Route {
  const index = RUNGS.findIndex((rung) => rung.applies(task));
  const rung = RUNGS[index];
  const route: Route = { method: rung.method, rung: index + 1, reason: rung.reason(task) };

  if (rung.method !== 'reward-search') return route;

  return {
    ...route,
    rewardSearch: {
      round: task.rewardSearchRounds + 1,
      stages: REWARD_SEARCH_STAGES.map((s) => ({ ...s })),
      warmStart: task.rewardSearchRounds > 0 || task.demo === 'given',
    },
  };
}
