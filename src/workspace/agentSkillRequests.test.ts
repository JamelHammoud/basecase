import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { currentDesign, skillFiles, skillFromTraining, skillHash, withEvidence, type Skill } from '../skills/artifacts';
import { fixtureModel } from '../skills/fixtureModels';
import type { ForgeJob } from '../skills/forgeRunner';
import type { SkillRunner } from '../skills/skillsClient';
import { runSkillsJob } from '../skills/skillsJob';
import type { SkillRecord } from '../skills/skillRecords';
import { designOf, SkillsRuntime, type ForgeFactory } from '../skills/skillsRuntime';
import { environmentHash } from '../skills/environment';
import { kitEnvironment } from '../skills/kitEnvironment';
import { NOMINAL_PHYSICS } from '../sim/physicsScales';
import { skillRecord } from '../skills/skillRecords';
import type { StressResult } from '../skills/stress';
import type { SkillsJob } from '../skills/skillsJob';
import { SKILL_HANDLERS } from './agentSkillRequests';

async function rig(fixture: string, stress?: (job: SkillsJob) => StressResult) {
  const mj = await loadMujoco();
  const runner: SkillRunner = (job, ports) =>
    (job.type === 'stress' && stress
      ? Promise.resolve({ type: 'stress', result: stress(job) })
      : runSkillsJob(job, { mj, ...ports })) as never;
  const jobs: Array<{ background: boolean; job: ForgeJob }> = [];
  const forge: ForgeFactory =
    ({ background }) =>
    (job) => {
      jobs.push({ background, job });

      return Promise.resolve({ ok: false, policy: null, events: [], stderr: 'stub forge: no policy' });
    };
  const saved = new Map<string, Skill>();
  const records: SkillRecord[] = [];
  const runtime = new SkillsRuntime({
    runner,
    forge,
    save: (path, text) => {
      saved.set(path, JSON.parse(text) as Skill);

      return Promise.resolve();
    },
    loadSkill: (hash) => Promise.resolve(saved.get(skillFiles(hash).skill) ?? null),
    onRecord: (record) => records.push(record),
    onChange: () => {},
  });
  const ctx = {
    skills: { runtime, buildModel: () => Promise.resolve(fixtureModel(fixture)) },
    project: () => ({ skills: records }),
    setAction: () => {},
  };

  return { ctx, runtime, jobs, records, saved };
}

const bend = {
  name: 'Bend',
  request: 'bend the elbow up',
  goal: { kind: 'open' },
  seconds: 0.6,
  contract: {
    success: {
      hold_for: {
        seconds: 0.2,
        within: 'whole',
        state: { atom: { expr: { signal: 'q_arm1' }, cmp: '>', value: 0.6, scale: 0.05 } },
      },
    },
  },
};

describe('agent skill tools', () => {
  it('lists the Motor Kit of a legged robot, each needing training', async () => {
    const { ctx } = await rig('quad-servo');
    const { text } = await SKILL_HANDLERS.skill_list({}, ctx);

    expect(text.split('\n')).toEqual([
      '- Stand (Motor Kit): needs training',
      '- Walk (Motor Kit): needs training',
      '- Get up (Motor Kit): needs training',
      '- Settle (Motor Kit): needs training',
    ]);
  });

  it('drafts a contract, shows it in words with a failing rollout, then races it and says what was tried', async () => {
    const { ctx, runtime, jobs, records } = await rig('arm-3dof');
    const drafted = (await SKILL_HANDLERS.skill_draft(bend, ctx)).text;
    const id = /^Draft ([0-9a-f]{64})/.exec(drafted)?.[1];

    expect(drafted).toContain('- Passes when: q_arm1 above 0.6, held 0.2 s within the whole try.');
    expect(drafted).toMatch(/- Holding still: fails \(margin -/);
    expect(drafted).toContain(`ask before train_skill draft "${id}"`);

    const started = await SKILL_HANDLERS.skill_train({ draft: id }, ctx);

    expect(started.text).toMatch(/^Racing solvers on the draft in the background/);
    await runtime.settled();

    const listed = (await SKILL_HANDLERS.skill_list({}, ctx)).text;

    expect(listed).toContain('Last race, “Bend”:');
    expect(listed).toContain('- Not found.');
    expect(listed).toContain('- reward-search: Forge trains robots with a floating base, and this one is fixed.');
    expect(jobs).toEqual([]);
    expect(records).toEqual([]);
  });

  it('asks for changes when the draft can’t be judged', async () => {
    const { ctx } = await rig('arm-3dof');
    const reply = await SKILL_HANDLERS.skill_draft({ ...bend, seconds: 900 }, ctx);

    expect(reply.text).toBe('Change the draft: A try lasts 0.5 to 60 s.');
  });

  it('trains a Kit entry through the Forge runner it is given, at user priority', async () => {
    const { ctx, runtime, jobs } = await rig('quad-servo');
    const reply = await SKILL_HANDLERS.skill_train({ kit: 'stand' }, ctx);

    expect(reply.text).toBe('Training the Motor Kit’s stand in the background. Follow it with list_skills.');
    expect((await SKILL_HANDLERS.skill_train({ kit: 'walk' }, ctx)).text).toMatch(/^Training is running/);
    await runtime.settled();
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs.every((j) => !j.background && j.job.name === 'Motor Kit: stand')).toBe(true);
  });

  it('points an arm at drafting, since the Motor Kit is for legs', async () => {
    const { ctx } = await rig('arm-3dof');

    expect((await SKILL_HANDLERS.skill_train({ kit: 'walk' }, ctx)).text).toMatch(/Teach this robot with draft_skill/);
  });

  it('stresses a ready Stand and answers with each condition’s numbers, the worst combination and the seed', async () => {
    const model = fixtureModel('quad-servo');
    const environment = kitEnvironment(model, 'stand');
    const draft = skillFromTraining({
      name: 'stand',
      start: null,
      current: currentDesign({ design: designOf(model), model, environment }),
      environment,
      controller: { kind: 'hold' },
    });
    const evidence = {
      arenaVersion: 1,
      binding: { ...draft.binding, environment: environmentHash(environment) },
      confidence: 0.95,
      bar: 0.75,
      variants: [{ variant: 'held-out' as const, trials: 32, passes: 32, lowerBound: 0.91, diverged: 0, failures: {} }],
      lowerBound: 0.91,
      passed: true,
      conditions: [],
      summary: '',
      saltCommitment: 'f'.repeat(64),
    };
    const skill = withEvidence(draft, evidence, environment);
    const sample = { point: { ...NOMINAL_PHYSICS, mass: 2 }, margin: -0.3, start: 0 };
    const asked: SkillsJob[] = [];
    const { ctx, records, saved } = await rig('quad-servo', (job) => {
      asked.push(job);

      return {
        seed: 'seed-1',
        budget: 40,
        rollouts: 40,
        nominal: { ...sample, point: NOMINAL_PHYSICS, margin: 0.4 },
        axes: [{ axis: 'mass', side: 'above', boundary: 1.6, worst: sample }],
        worst: sample,
        starts: [model.initial],
        findings: [],
        trace: [],
      };
    });

    saved.set(skillFiles(skillHash(skill)).skill, skill);
    records.push(skillRecord(skill, { kit: 'stand' }));

    const reply = await SKILL_HANDLERS.skill_stress({ skill: 'stand', budget: 40 }, ctx);

    expect(asked).toMatchObject([{ type: 'stress', budget: 40, skill: { name: 'stand' } }]);
    expect(reply.text.split('\n').slice(0, 4)).toEqual([
      'Stressed Stand with 40 of 40 rollouts, seed seed-1.',
      'Normal physics: margin +0.40, it passes there.',
      'Each condition alone:',
      '- Weight: fails above ×1.60 (tested ×0.50 to ×2.00).',
    ]);
    expect(reply.text).toContain('Worst combination found: friction 1.00, weight ×2.00, strength 100%, latency 0 ms');
    expect(records.at(-1)?.stress).toEqual({ seed: 'seed-1', budget: 40, rollouts: 40, findings: [] });
  });

  it('asks for a trained skill before stressing one', async () => {
    const { ctx } = await rig('quad-servo');

    expect((await SKILL_HANDLERS.skill_stress({ skill: 'walk' }, ctx)).text).toBe(
      'Walk isn’t ready (needs training). Stress a skill once Arena has passed it.',
    );
    expect((await SKILL_HANDLERS.skill_stress({ skill: 'jump' }, ctx)).text).toBe(
      'No skill named "jump". Skills: Stand, Walk, Get up, Settle.',
    );
  });
});
