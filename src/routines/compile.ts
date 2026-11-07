import { checkRoutine } from './compileChecks';
import { CompileContext, type CompileOptions } from './compileContext';
import { flatten } from './compileFlatten';
import { FlowChecker } from './compileFlow';
import { canonicalJson, sha256 } from './hash';
import type { Plan } from './planTypes';
import type { RoutineError } from './schema';
import { validateRoutine } from './schemaValidate';

export type { CompileOptions } from './compileContext';

export type CompileResult =
  { ok: true; plan: Plan; errors?: undefined } | { ok: false; plan?: undefined; errors: RoutineError[] };

const MAX_OPS = 4096;
const MAX_FACTS = 256;

export function planHash(plan: Plan): string {
  return sha256(canonicalJson({ ...plan, hash: undefined }));
}

function compileValid(input: unknown, options: CompileOptions): CompileResult {
  const valid = validateRoutine(input);

  if (!valid.ok) return valid;

  const ctx = new CompileContext(valid.routine, options);
  const flow = new FlowChecker(ctx);

  checkRoutine(ctx);
  flow.run();

  if (ctx.errors.length) return { ok: false, errors: ctx.errors };

  const plan = flatten(ctx, flow);

  if (plan.ops.length > MAX_OPS || plan.facts.length > MAX_FACTS) {
    return { ok: false, errors: [{ code: 'too-large', message: 'This Routine is too big to run.' }] };
  }

  plan.hash = planHash(plan);

  return { ok: true, plan };
}

export function compileRoutine(input: unknown, options: CompileOptions): CompileResult {
  try {
    return compileValid(input, options);
  } catch {
    return { ok: false, errors: [{ code: 'unreadable', message: "This Routine can't be read." }] };
  }
}
