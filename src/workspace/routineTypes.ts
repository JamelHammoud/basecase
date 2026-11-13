import type { CompileResult } from '../routines/compile';
import type { RoutineKit } from '../routines/physicsKit';
import type { Plan } from '../routines/planTypes';
import type { TraceEvent } from '../routines/scenarioTypes';
import type { Routine, RoutineError } from '../routines/schema';
import { ownId, type OwnSkill } from './routineCheck';

export interface RoutineRun {
  live: boolean;
  done: boolean;
  trace: TraceEvent[];
  said: string[];
  failures: string[];
}

export interface RoutineTests {
  passed: boolean;
  scenarios: Array<{ covers: string; passed: boolean }>;
}

export interface RoutineView {
  routine: Routine | null;
  compiled: CompileResult | null;
  kit: RoutineKit | null;
  tests: RoutineTests | null;
  run: RoutineRun | null;
  checking: boolean;
  own: OwnSkill[];
}

export const EMPTY_VIEW: RoutineView = {
  routine: null,
  compiled: null,
  kit: null,
  tests: null,
  run: null,
  checking: false,
  own: [],
};

export interface RoutineStateSnapshot {
  routine: Routine | null;
  compiled: { ok: boolean; errors?: RoutineError[]; plan?: Plan } | null;
  tests: RoutineTests | null;
  run: Omit<RoutineRun, 'failures'> | null;
  skills: Array<{ id: string; hash: string }>;
}

export function snapshotOf(view: RoutineView): RoutineStateSnapshot {
  const { routine, compiled, tests, run, own } = view;

  return {
    routine,
    compiled: compiled && (compiled.ok ? { ok: true, plan: compiled.plan } : { ok: false, errors: compiled.errors }),
    tests,
    run: run && { live: run.live, done: run.done, trace: run.trace, said: run.said },
    skills: own.map((o) => ({ id: ownId(o), hash: o.hash })),
  };
}
