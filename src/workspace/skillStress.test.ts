import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Simulation } from '../sim/useSimulation';
import { skillHash } from '../skills/artifacts';
import { fixtureModel } from '../skills/fixtureModels';
import { readyStand, stubForge } from '../skills/hubSkillFixtures';
import { kitEnvironment } from '../skills/kitEnvironment';
import { skillRecord, withRecord } from '../skills/skillRecords';
import { skillRows } from '../skills/skillRows';
import type { SkillRunner } from '../skills/skillsClient';
import type { SkillsJob } from '../skills/skillsJob';
import { designOf, SkillsRuntime } from '../skills/skillsRuntime';
import { STRESS_BUDGET, type StressResult } from '../skills/stress';
import { widenedEnvironment } from '../skills/stressTrain';
import type { CommandInputs } from './sceneCommands';
import { stressCommands } from './stressCommands';
import { useSkillStress, type SkillStressState } from './useSkillStress';

const model = fixtureModel('quad-servo');
const environment = kitEnvironment(model, 'stand');
const skill = readyStand(model, designOf(model));
const retrained = { ...skill, warmStartFrom: skillHash(skill) };
const finding = {
  axis: 'mass',
  side: 'above',
  boundary: 1.65,
  margin: -0.2,
  run: { friction: 0.8, mass: 1.8, strength: 0.9, latencyMs: 40 },
} as const;
const result: StressResult = {
  skill: skillHash(skill),
  seed: 'stress-wiring',
  start: { ...model.initial, values: { ...model.initial.values, [model.joints[0].id]: 7 } },
  budget: STRESS_BUDGET,
  rollouts: 24,
  nominal: 0.5,
  axes: [finding],
  findings: [finding],
  worst: { run: finding.run, margin: finding.margin },
};

function scenario(status: Simulation['status'] = 'off') {
  let records = [{ ...skillRecord(skill, { kit: 'stand' }), createdAt: '2026-01-01T00:00:00.000Z' }];
  const runner = vi.fn(async (job: SkillsJob) => {
    if (job.type === 'stress') return { type: 'stress', result };

    if (job.type === 'stress-train')
      return {
        type: 'stress-train',
        outcome: {
          kind: 'kept',
          skill: retrained,
          evidence: retrained.evidence,
          environment: widenedEnvironment(environment, job.findings),
        },
      };

    throw new Error(`Unexpected job ${job.type}`);
  });
  const runtime = new SkillsRuntime({
    runner: runner as SkillRunner,
    forge: () => stubForge().forge,
    save: () => Promise.resolve(),
    loadSkill: () => Promise.resolve(skill),
    onRecord: (record) => (records = withRecord(records, record)),
    onChange: () => {},
  });
  const sim = {
    status,
    buildModel: vi.fn(async () => model),
    start: vi.fn(async () => {}),
    setPhysics: vi.fn(),
    setController: vi.fn(),
    resetTo: vi.fn(),
  };
  const loadSkill = vi.fn(async () => skill);
  const captured: { stress?: SkillStressState } = {};

  function Capture() {
    captured.stress = useSkillStress({
      sim: sim as unknown as Simulation,
      runtime,
      loadSkill,
      environmentOf: () => environment,
    });

    return null;
  }

  renderToString(createElement(Capture));

  const stress = captured.stress!;
  const row = () =>
    skillRows({
      model,
      design: designOf(model),
      records,
      jobs: runtime.jobs,
      stress: { 'kit:stand': runtime.stress.reportOf('kit:stand') ?? undefined },
    }).find((r) => r.kit === 'stand')!;
  const openRightTab = vi.fn();
  const showToast = vi.fn();
  const commands = () =>
    stressCommands({
      core: { simTraining: { skills: { rows: [row()], stress } }, tool: { openRightTab }, showToast },
    } as unknown as CommandInputs);

  return { runtime, runner, sim, loadSkill, stress, row, commands, openRightTab, showToast };
}

describe('Stress commands and replay', () => {
  it('runs Stress from a ready row, replays its finding and replaces the record after Train on These', async () => {
    const s = scenario();
    const run = vi.spyOn(s.stress, 'run');
    const train = vi.spyOn(s.stress, 'train');

    expect(s.commands().map((c) => c.label)).toEqual(['Stress Stand']);
    s.commands()[0].run();
    await run.mock.results[0].value;
    await s.runtime.settled();

    expect(s.openRightTab).toHaveBeenCalledWith('sim');
    expect(s.loadSkill).toHaveBeenCalledWith(skillHash(skill));
    expect(s.runner.mock.calls[0][0]).toEqual({ type: 'stress', model, skill, environment, budget: STRESS_BUDGET });
    expect(s.row().stress?.result.findings).toEqual([finding]);

    await s.stress.replay(s.row(), finding);

    expect(s.sim.start).toHaveBeenCalledOnce();
    expect(s.sim.setPhysics).toHaveBeenCalledWith(finding.run);
    expect(s.sim.setController).toHaveBeenCalledWith(skill.controller);
    expect(s.sim.resetTo).toHaveBeenCalledWith(result.start);
    expect(s.commands().map((c) => c.label)).toEqual(['Stress Stand', 'Train Stand on These']);
    s.commands()[1].run();
    await train.mock.results[0].value;
    await s.runtime.settled();

    expect(s.runner.mock.calls[1][0]).toMatchObject({
      type: 'stress-train',
      model,
      skill,
      environment,
      entry: 'stand',
      design: designOf(model),
      findings: [finding],
    });
    expect(s.row().record?.hash).toBe(skillHash(retrained));
    expect(s.row().record?.hash).not.toBe(skillHash(skill));
    expect(s.row().state.kind).toBe('ready');
    expect(s.row().stress).toBeUndefined();
    expect(s.commands().map((c) => c.label)).toEqual(['Stress Stand']);
    expect(s.showToast).not.toHaveBeenCalled();
  });

  it('replays into a running simulation without restarting it', async () => {
    const s = scenario('ready');

    await s.stress.run(s.row());
    await s.runtime.settled();
    await s.stress.replay(s.row(), finding);

    expect(s.sim.start).not.toHaveBeenCalled();
    expect(s.sim.setPhysics).toHaveBeenCalledWith(finding.run);
    expect(s.sim.setController).toHaveBeenCalledWith(skill.controller);
    expect(s.sim.resetTo).toHaveBeenCalledWith(result.start);
  });
});
