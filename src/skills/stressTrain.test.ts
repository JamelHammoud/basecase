import type { MainModule } from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { skillHash, type ArenaEvidence } from './artifacts';
import { fixtureModel } from './fixtureModels';
import { readyStand, stubForge } from './hubSkillFixtures';
import { kitEnvironment } from './kitEnvironment';
import type { ProveInput } from './prove';
import { NOMINAL_RUN, type StressAxisResult } from './stress';
import { FORGE_RANGES, stressJob, trainOnFindings, widenedEnvironment, type StressJudge } from './stressTrain';

const model = fixtureModel('quad-servo');
const environment = kitEnvironment(model, 'stand');
const skill = readyStand(model, 'quad');
const mj = {} as MainModule;

const finding = (axis: StressAxisResult['axis'], boundary: number, side: StressAxisResult['side']) => ({
  axis,
  boundary,
  side,
  margin: -0.2,
  run: { ...NOMINAL_RUN, [axis]: boundary },
});

const evidence = (passed: boolean) => ({ ...skill.evidence!, passed, summary: passed ? 'Passed.' : '20 of 32 tries.' });

function judge(passed: boolean) {
  const seen: ProveInput[] = [];
  const stub: StressJudge = {
    prove: (input) => {
      seen.push(input);

      const proven = { ...skill, controller: input.controller, warmStartFrom: input.warmStartFrom ?? null };

      return Promise.resolve({ skill: passed ? proven : null, evidence: evidence(passed) as ArenaEvidence });
    },
  };

  return { seen, stub };
}

describe('Train on These', () => {
  it('widens only the failing axis, past its boundary and inside the limits', () => {
    const mass = widenedEnvironment(environment, [finding('mass', 1.65, 'above')]);
    const r = environment.randomization;

    expect(mass.randomization).toEqual({ ...r, mass: [r.mass[0], 1.65 + 1.5 / 8] });
    expect(mass.contract).toEqual(environment.contract);
    expect(widenedEnvironment(environment, [finding('mass', 1.95, 'above')]).randomization.mass).toEqual([0.9, 2]);
    expect(widenedEnvironment(environment, [finding('friction', 0.3, 'below')]).randomization.friction).toEqual([
      0.2, 1.2,
    ]);
  });

  it('trains in Forge on the wider ranges, warm-started from the skill', () => {
    const wide = widenedEnvironment(environment, [
      finding('mass', 1.65, 'above'),
      finding('latencyMs', 100, 'above'),
      finding('strength', 0.6, 'below'),
    ]);
    const job = stressJob({ model, entry: 'stand', skill }, wide);

    expect(job.job.randomRanges).toEqual({
      friction: [...FORGE_RANGES.friction],
      mass: [0.85, wide.randomization.mass[1]],
    });
    expect(job.job.delaySteps).toEqual([0, 6]);
    expect(job.job.warmPolicy).toEqual(skill.controller.kind === 'policy' ? skill.controller.policy : null);
    expect(job.xml).toContain('forcerange="-0.95 0.95"');
    expect(model.xml).toContain('forcerange="-1.9 1.9"');
  });

  it('keeps a retrained skill only when Arena passes it on the wider ranges', async () => {
    const findings = [finding('mass', 1.65, 'above')];
    const base = { mj, model, design: 'quad', entry: 'stand' as const, skill, environment, findings };
    const forge = stubForge();
    const failing = judge(false);
    const dropped = await trainOnFindings({ ...base, ...forge, save: () => Promise.resolve(), judge: failing.stub });

    expect(dropped).toMatchObject({ kind: 'dropped', evidence: { passed: false } });
    expect(forge.jobs).toHaveLength(1);
    expect(failing.seen[0].environment.randomization.mass[1]).toBeCloseTo(1.8375, 9);

    const passing = judge(true);
    const kept = await trainOnFindings({ ...base, ...stubForge(), save: () => Promise.resolve(), judge: passing.stub });

    expect(kept.kind).toBe('kept');
    expect(passing.seen[0].warmStartFrom).toBe(skillHash(skill));
  });

  it('refuses without a boundary or a policy, and trains nothing', async () => {
    const forge = stubForge();
    const base = {
      mj,
      model,
      design: 'quad',
      entry: 'stand' as const,
      environment,
      ...forge,
      save: () => Promise.resolve(),
    };
    const none = await trainOnFindings({ ...base, skill, findings: [] });
    const held = await trainOnFindings({
      ...base,
      skill: { ...skill, controller: { kind: 'hold' } },
      findings: [finding('mass', 1.65, 'above')],
    });

    expect(none.kind).toBe('refused');
    expect(held.kind).toBe('refused');
    expect(forge.jobs).toEqual([]);
  });
});
