import { describe, expect, it } from 'vitest';
import { greetingRoutine } from './greeting';
import { mutate } from './mutate';
import { findNode, MODEL_NODES } from './nodes';
import { allSteps } from './schema';

describe('the ML node catalogue', () => {
  it('lists each node once, with a model, licence and an empty speed slot until measured', () => {
    expect(new Set(MODEL_NODES.map((n) => n.id)).size).toBe(MODEL_NODES.length);

    for (const node of MODEL_NODES) {
      expect(node.model && node.licence && node.label).toBeTruthy();
      expect(node.runsOn.length).toBeGreaterThan(0);
      expect(node.measuredMs).toEqual({});
    }
  });

  it('has every model the greeting uses', () => {
    const routine = greetingRoutine();
    const models = [
      ...routine.watchers.map((w) => w.model),
      ...allSteps(routine).flatMap((s) => ('model' in s ? [s.model] : [])),
    ];

    for (const model of models) expect(findNode(model), model).toBeDefined();
  });
});

describe('mutate', () => {
  it('always changes the Routine, the same way for the same seed', () => {
    const original = JSON.stringify(greetingRoutine());

    for (let seed = 0; seed < 100; seed++) {
      const once = JSON.stringify(mutate(greetingRoutine(), seed));

      expect(once).not.toBe(original);
      expect(JSON.stringify(mutate(greetingRoutine(), seed))).toBe(once);
    }
  });
});
