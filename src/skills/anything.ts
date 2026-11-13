import { modelHashes } from './artifacts';
import { validateEnvironment } from './environment';
import { checkFeasibility } from './feasibility';
import { runCounted, type ForgeRunner, type ForgeTally } from './forgeRunner';
import type { RaceCost } from './raceTypes';
import type { Method } from './router';
import { approvedSpec } from './anythingApproval';
import { bodyFacts, type BodyFacts } from './anythingBody';
import { askClaude, type Ask } from './anythingClaude';
import { taskEnvironment } from './anythingEnvironment';
import { Poser } from './anythingPoser';
import { race, routeOf, solveMethod, travels, type Attempt, type Task } from './anythingRace';
import type { AnythingInput, AnythingOutcome, TaskSpec } from './anythingTypes';
import { errorMessage } from '../utils/errorMessage';

export type { AnythingInput, AnythingOutcome, Approval, Proposal } from './anythingTypes';

const BUILT: readonly Method[] = ['ik-or-motion-plan', 'reward-search'];

class Meter {
  private readonly started = performance.now();
  readonly tally: ForgeTally = { steps: 0, forgeRuns: 0 };

  seconds = () => (performance.now() - this.started) / 1000;

  cost = (): RaceCost => ({ wallS: this.seconds(), steps: this.tally.steps });
}

function unsolvable(method: Method | undefined, facts: BodyFacts): string | null {
  if (!method) return null;

  if (!BUILT.includes(method)) return 'This solver isn’t built.';

  return method === 'reward-search' && facts.cls !== 'legs'
    ? 'Forge learns policies for legged robots; this robot has none to learn.'
    : null;
}

function capability(facts: BodyFacts, spec: TaskSpec): string | null {
  if (travels(spec) && !facts.floating) return 'This robot’s base is fixed, so it can’t travel.';

  const posture = spec.intent.some((k) => k.base?.up || k.base?.tilt);

  return posture && facts.cls !== 'legs' ? 'Only a robot on legs can crouch, lean or rise.' : null;
}

function standRefusal(input: AnythingInput, facts: BodyFacts): string | null {
  if (facts.cls !== 'legs') return null;

  const report = checkFeasibility(input.mj, input.model, { robot: facts.robot, stand: true });

  return report.feasible ? null : report.summary;
}

function outcomeOf(attempts: Attempt[], meter: Meter): AnythingOutcome {
  const found = attempts.find((a) => a.skill);

  if (found?.skill) return { kind: 'skill', skill: found.skill, method: found.method, cost: meter.cost() };

  const reason = attempts.map((a) => `${a.method}: ${a.reason}`).join(' ') || 'No solver applies.';

  return { kind: 'not-found', reason, cost: meter.cost() };
}

async function solve(input: AnythingInput, options: { facts: BodyFacts; poser: Poser; meter: Meter; ask: Ask }) {
  const { facts, poser, meter } = options;
  const key = `${input.prompt}|${modelHashes(input.model).physics}`;
  const session = { ask: options.ask, request: input.prompt, facts, signal: input.signal };
  const approval = await approvedSpec({ session, poser, approve: input.approve, key });

  if (approval.kind === 'deformable') return { kind: 'unverifiable', reason: approval.reason } as const;

  if (approval.kind !== 'approved') return { kind: 'refused', reason: approval.reason } as const;

  const { spec, lowered } = approval;
  const refusal = capability(facts, spec) ?? standRefusal(input, facts);

  if (refusal) return { kind: 'refused', reason: refusal } as const;

  const environment = taskEnvironment({ model: input.model, facts, spec, lowered });
  const problems = await validateEnvironment(environment, input.model);

  if (problems.length) return { kind: 'refused', reason: problems.join(' ') } as const;

  const forge: ForgeRunner = (job) => runCounted(input.forge, job, meter.tally);
  const task: Task = {
    ...input,
    forge,
    facts,
    poser,
    spec,
    environment,
    budgetSteps: input.budget.steps,
    secondsLeft: () => input.budget.wallS - meter.seconds(),
    steps: () => meter.tally.steps,
  };
  const attempts = input.method
    ? [await solveMethod(task, { method: input.method, cost: meter.cost })]
    : await race(task, { route: routeOf(facts, spec), cost: meter.cost });

  return outcomeOf(attempts, meter);
}

export async function trainAnything(input: AnythingInput, ask: Ask = askClaude): Promise<AnythingOutcome> {
  const meter = new Meter();
  const facts = bodyFacts(input.mj, input.model);
  const early = unsolvable(input.method, facts);

  if (early) return { kind: 'not-found', reason: early, cost: meter.cost() };

  const poser = new Poser(input.mj, input.model, facts);

  try {
    return await solve(input, { facts, poser, meter, ask });
  } catch (error) {
    return { kind: 'not-found', reason: `Stopped: ${errorMessage(error)}`, cost: meter.cost() };
  } finally {
    poser.dispose();
  }
}
