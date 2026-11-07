import { describe, expect, it } from 'vitest';
import { compileRoutine, generateScenarios, greetingRoutine, runScenario } from '../../src/routines/testing';

describe('canary: a Routine that greets strangers by name', () => {
  it('claims to pass every scenario, and must not', async () => {
    const r = structuredClone(greetingRoutine());
    const text = JSON.stringify(r).replace(/"Hello"/g, '"Hello Maya"');
    const compiled = compileRoutine(JSON.parse(text));

    if (!compiled.ok) throw new Error('Compile failed');

    for (const s of generateScenarios(compiled.plan)) expect((await runScenario(compiled.plan, s)).passed).toBe(true);
  });
});
