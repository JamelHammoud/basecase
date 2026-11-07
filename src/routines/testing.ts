import { compileRoutine as compile, type CompileOptions, type CompileResult } from './compile';
import { FIXTURE_SKILLS } from './fixtureSkills';

export { planHash } from './compile';
export { generateScenarios } from './generate';
export { greetingRoutine } from './greeting';
export { mutate } from './mutate';
export { runScenario } from './scenario';

export function compileRoutine(routine: unknown, options: Partial<CompileOptions> = {}): CompileResult {
  return compile(routine, { skills: FIXTURE_SKILLS, ...options });
}
