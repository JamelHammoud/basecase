import { describe, expect, it } from 'vitest';
import { fastenerPlanningFixture, planningScrew } from '../assembly/fastenerPlanning.fixtures';
import type { RemovalStep } from '../assembly/removalOrder';
import type { GuideStep } from './guideTypes';
import { provesReassembly } from './repairProof';

const guideStep = (action: RemovalStep): GuideStep => ({
  kind: 'build',
  number: 1,
  moduleId: 'main',
  partIds: action.ids,
  contextIds: [],
  moves: action.ids.map((partId) => ({ partId, offset: [0, 20, 0] })),
  arrows: [],
  callout: [],
  tools: [],
});

describe('indexed repair proof', () => {
  it.each([150, 300])('proves reassembly without rescanning screw stacks at %i parts', (count) => {
    const f = fastenerPlanningFixture(count);
    const proof = { geometry: f.geometry, target: f.parts.at(-1)!, removal: f.plan.steps, initial: [] };
    const steps = [...f.plan.steps].reverse().map(guideStep);

    expect(provesReassembly(proof, steps)).toBe(true);
    expect(f.stackReads()).toBeLessThanOrEqual(count * 2);
  });

  it('rejects an installed screw clamping an added part, including a shared stack', () => {
    const f = fastenerPlanningFixture(2);
    const proof = { geometry: f.geometry, target: f.parts[0], removal: [f.plan.steps[2]], initial: [f.screws[1]] };

    f.geometry.chains.screws[1] = planningScrew(f.screws[1], [f.parts[1], f.parts[0]]);

    expect(provesReassembly(proof, [guideStep(f.plan.steps[2])])).toBe(false);
    expect(provesReassembly({ ...proof, initial: [] }, [guideStep(f.plan.steps[2])])).toBe(true);
  });
});
