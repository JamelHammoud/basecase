import { routineToFlow } from '../routines/flow';
import type { Scenario } from '../routines/scenarioTypes';
import { validateRoutine } from '../routines/schema';
import type { Routines } from './useRoutines';

type Payload = Record<string, unknown>;

interface RoutineContext {
  routines: Routines;
  setAction: (action: string) => void;
}

type Handler = (payload: Payload, ctx: RoutineContext) => Promise<unknown>;

const MAX_SECONDS = 60;

const isRecord = (v: unknown): v is Payload => typeof v === 'object' && v !== null && !Array.isArray(v);

function withSentence(routine: unknown, sentence: unknown): unknown {
  if (!isRecord(routine) || routine.sentence !== undefined || typeof sentence !== 'string' || !sentence) return routine;

  return { ...routine, sentence };
}

function flowNodes(routine: unknown) {
  const valid = validateRoutine(routine);

  return valid.ok ? routineToFlow(valid.routine).nodes.map(({ id, kind }) => ({ id, kind })) : [];
}

export function scenarioFrom(input: unknown): Scenario {
  const s = isRecord(input) ? input : {};
  const seconds = typeof s.seconds === 'number' && s.seconds > 0 ? Math.min(s.seconds, MAX_SECONDS) : 20;

  return {
    covers: typeof s.covers === 'string' ? s.covers : 'run',
    world: Array.isArray(s.world) ? (s.world as Scenario['world']) : [],
    mocks: isRecord(s.mocks) ? (s.mocks as Scenario['mocks']) : {},
    faults: Array.isArray(s.faults) ? (s.faults as Scenario['faults']) : [],
    seconds,
    expect: Array.isArray(s.expect) ? (s.expect as Scenario['expect']) : [],
  };
}

const makeRoutine: Handler = async (payload, ctx) => {
  ctx.setAction('Making a Routine');

  const routine = withSentence(payload.routine, payload.sentence);
  const compiled = await ctx.routines.make(routine);

  return compiled.ok
    ? { ok: true, nodes: flowNodes(routine) }
    : { ok: false, errors: compiled.errors, nodes: flowNodes(routine) };
};

const testRoutine: Handler = async (_payload, ctx) => {
  ctx.setAction('Testing the Routine');

  return ctx.routines.test();
};

const runRoutine: Handler = async (payload, ctx) => {
  const scenario = scenarioFrom(payload.scenario);

  ctx.setAction('Running the Routine');

  return payload.live === true ? ctx.routines.runLive(scenario) : ctx.routines.runHeadless(scenario);
};

export const ROUTINE_HANDLERS: Record<string, Handler> = {
  make_routine: makeRoutine,
  test_routine: testRoutine,
  run_routine: runRoutine,
};
