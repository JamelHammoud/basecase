import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import walk from '../routines/kit/quad-servo-velocity-tracking.skill.json';
import { currentDesign, skillFiles, skillFromTraining, skillHash, type Skill } from '../skills/artifacts';
import { environmentHash } from '../skills/environment';
import { kitEnvironment } from '../skills/kitEnvironment';
import { kitReward } from '../skills/kitRewards';
import { fixtureModel } from '../skills/fixtureModels';
import type { ForgeJob } from '../skills/forgeRunner';
import type { SkillRunner } from '../skills/skillsClient';
import { runSkillsJob } from '../skills/skillsJob';
import { skillRecord, type SkillRecord } from '../skills/skillRecords';
import { designOf, SkillsRuntime, type ForgeFactory } from '../skills/skillsRuntime';
import { SKILL_HANDLERS } from './agentSkillRequests';

async function rig(fixture: string) {
  const mj = await loadMujoco();
  const runner: SkillRunner = (job, ports) => runSkillsJob(job, { mj, ...ports }) as never;
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

function readyWalk(saved: Map<string, Skill>, records: SkillRecord[]) {
  const model = fixtureModel('quad-servo');
  const environment = kitEnvironment(model, 'velocity-tracking');
  const current = currentDesign({ design: designOf(model), model, environment });
  const controller = { ...(walk as unknown as Skill).controller, robot: environment.robot } as Skill['controller'];
  const trained = skillFromTraining({ name: 'Velocity tracking', start: null, current, environment, controller });
  const evidence = {
    ...(walk as unknown as Skill).evidence!,
    binding: { ...trained.binding, environment: environmentHash(environment) },
  };
  const skill: Skill = { ...trained, evidence };

  saved.set(skillFiles(skillHash(skill)).skill, skill);
  records.push(skillRecord(skill, { kit: 'velocity-tracking' }));
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

  it('coaches a ready Walk in two calls, and keeps the old skill when Forge returns nothing', async () => {
    const { ctx, runtime, jobs, records, saved } = await rig('quad-servo');

    readyWalk(saved, records);

    const words = 'lift your feet higher';
    const brief = (await SKILL_HANDLERS.skill_coach({ skill: 'walk', words }, ctx)).text;

    expect(brief).toContain('- foot_clearance: ');
    expect(brief).toContain('Call coach_skill again');

    const bad = await SKILL_HANDLERS.skill_coach(
      { skill: 'Walk', words, reward: 'x = 1', signal: 'speed', direction: 'up' },
      ctx,
    );

    expect(bad.text).toMatch(/^Change the revision: The reward doesn’t parse/);

    const reward = `${kitReward(fixtureModel('quad-servo'), 'velocity-tracking')}\n\ndef lift(state):\n    return 1.0\n`;
    const started = await SKILL_HANDLERS.skill_coach(
      { skill: 'Walk', words, reward, signal: 'foot_clearance', direction: 'up' },
      ctx,
    );

    expect(started.text).toMatch(/^Coaching Walk in Forge/);
    await runtime.settled();
    expect(jobs.map((j) => j.job.name)).toEqual(['Coach: Velocity tracking']);
    expect((jobs[0].job.job as { warmPolicy?: unknown }).warmPolicy).toBeTruthy();
    expect(records).toHaveLength(1);
    expect((await SKILL_HANDLERS.skill_list({}, ctx)).text).toContain(
      '- Dropped; the old skill stays. stub forge: no policy',
    );
  }, 60_000);
});
