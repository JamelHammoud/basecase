import { describe, expect, it } from 'vitest';
import { dependencies, waitsOn } from './dependsOn.mjs';

const runtime = {
  number: 482,
  title: 'Run a Case’s own code as panels and canvas overlays, sandboxed, reading every signal',
  body: 'Request: #480',
};
const authoring = {
  number: 483,
  title: 'Let the agent write and revise a Case’s code from the composer',
  body: 'Request: #480\n\n**Depends on** "Run a Case\'s own code as panels and canvas overlays" (same arc). Build on main once it lands.',
};

describe('steps that depend on another step', () => {
  it('reads the quoted titles a step depends on', () => {
    expect(dependencies(authoring.body)).toEqual(["Run a Case's own code as panels and canvas overlays"]);
    expect(dependencies('Depends on "A step" and "Another step".')).toEqual(['A step', 'Another step']);
    expect(dependencies(runtime.body)).toEqual([]);
  });

  it('waits while the step it depends on is open, and builds once it is gone', () => {
    expect(waitsOn(authoring, [runtime, authoring])).toBe(true);
    expect(waitsOn(authoring, [authoring])).toBe(false);
    expect(waitsOn(runtime, [runtime, authoring])).toBe(false);
  });
});
