import type { CompileResult } from '../routines/compile';
import type { Plan } from '../routines/planTypes';
import type { RoutineError } from '../routines/schema';
import type { RoutineView } from './routineTypes';

export function routineVisionCompilation(plan: Plan, errors: RoutineError[]): CompileResult {
  return errors.length ? { ok: false, errors } : { ok: true, plan };
}

export function routineCanRun(view: Pick<RoutineView, 'compiled' | 'run'>): boolean {
  const { compiled, run } = view;

  if (!compiled || (run && !run.done)) return false;

  return (
    compiled.ok || (compiled.errors.length > 0 && compiled.errors.every((error) => error.code === 'model-unavailable'))
  );
}
