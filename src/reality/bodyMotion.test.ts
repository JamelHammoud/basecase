import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { analyzeBody } from './bodyAnalysis';
import { bodyAnalysisScenario, BODY_ANALYSIS_SCENARIOS } from './bodyAnalysisMatrix.fixtures';
import { recommendBodyMotion } from './bodyMotion';
import { BODY_MOTION_LIMITS } from './bodyMotionTypes';

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

describe('next motion through production MuJoCo', () => {
  it.each(BODY_ANALYSIS_SCENARIOS)('returns a supported preview or truthful refusal for %s', async (name) => {
    const { request } = await bodyAnalysisScenario(mj, name);
    const result = await analyzeBody(request, { mj });

    if (result.kind !== 'analyzed') throw new Error(result.reason);

    const selected = result.parameters.flatMap((parameter, index) =>
      parameter.distinguishability === 'distinguishable' ? [] : [index],
    );
    const before = structuredClone({ request, result });
    const input = { request, result, selected };
    const started = performance.now();
    const outcome = await recommendBodyMotion(input, { mj });
    const elapsedMs = performance.now() - started;

    expect(outcome.physicsSteps).toBeLessThanOrEqual(BODY_MOTION_LIMITS.physicsSteps);
    expect(outcome.candidates.length).toBeLessThanOrEqual(BODY_MOTION_LIMITS.candidates);
    expect({ request, result }).toEqual(before);
    expect(outcome.kind).not.toBe('refused');

    if (!selected.length) expect(outcome.kind).toBe('no-improvement');

    if (name === 'coupled wrist') expect(outcome.kind).toBe('no-improvement');

    if (outcome.kind === 'recommended') {
      expect(outcome.preview.positions).toHaveLength(outcome.plan.run.statuses.length);
      expect(outcome.score.resolved).toBe(true);
      expect(outcome.preview.positions.flat().every(Number.isFinite)).toBe(true);
    }

    expect(await recommendBodyMotion(input, { mj })).toEqual(outcome);
    mkdirSync('scratch', { recursive: true });
    writeFileSync(
      `scratch/body-motion-matrix-${name.replaceAll(' ', '-')}.json`,
      JSON.stringify(
        {
          name,
          kind: outcome.kind,
          selected,
          elapsedMs,
          physicsSteps: outcome.physicsSteps,
          candidates: outcome.candidates.map(({ plan, score }) => ({ id: plan.id, score })),
        },
        null,
        2,
      ),
    );
  });

  it('refuses cancellation, exhausted budgets, mismatched sources and altered noise assumptions', async () => {
    const { request } = await bodyAnalysisScenario(mj, 'horizontal arm');
    const result = await analyzeBody(request, { mj });

    if (result.kind !== 'analyzed') throw new Error(result.reason);

    const input = { request, result, selected: [0] };

    expect((await recommendBodyMotion(input, { mj, cancelled: () => true })).kind).toBe('refused');
    expect((await recommendBodyMotion(input, { mj, stepBudget: 1 })).kind).toBe('refused');
    expect((await recommendBodyMotion(input, { mj, stepBudget: NaN })).kind).toBe('refused');
    expect((await recommendBodyMotion({ ...input, selected: [99] }, { mj })).kind).toBe('refused');

    let checks = 0;
    const cancelled = await recommendBodyMotion(input, { mj, cancelled: () => ++checks > 100 });

    expect(cancelled.kind).toBe('refused');
    expect(cancelled.physicsSteps).toBeGreaterThan(0);

    if (cancelled.kind === 'refused') expect(cancelled.reason).toBe('cancelled');

    const mismatchedUnits = structuredClone(request);

    mismatchedUnits.units[0] = 'm';
    expect(await recommendBodyMotion({ ...input, request: mismatchedUnits }, { mj })).toMatchObject({
      kind: 'refused',
      reason: 'units',
    });

    const unsupported = structuredClone(request);

    unsupported.model.joints[0].drive = 'velocity';
    expect(await recommendBodyMotion({ ...input, request: unsupported }, { mj })).toMatchObject({
      kind: 'refused',
      reason: 'unsupported',
    });
    expect(
      (
        await recommendBodyMotion(
          { ...input, result: { ...result, source: { ...result.source, unit: 'other' } } },
          { mj },
        )
      ).kind,
    ).toBe('refused');

    const changedNoise = structuredClone(result);

    Object.assign(changedNoise.method, { noiseRad: 0.5 });
    expect((await recommendBodyMotion({ ...input, result: changedNoise }, { mj })).kind).toBe('refused');
  });
});
