import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { act, type PolicySpec } from '../sim/policy';
import type { SimModel } from '../sim/mjcfTypes';
import { modelHashes, skillHash, type Skill } from './artifacts';
import { fixtureModel } from './fixtureModels';
import { installPlan, publishedSkillFiles, readPublishedSkill, skillLink, skillRepoName } from './hubSkill';
import { readyStand, stubForge } from './hubSkillFixtures';
import { kitEnvironment } from './kitEnvironment';
import { trainKitEntry } from './motorKit';
import { mappedPolicy } from './policyMap';
import { jointMap, robotSchema } from './robotSchema';
import { refusedLine } from './skillRecords';

const quad = fixtureModel('quad-servo');
const hexapod = fixtureModel('hexapod');
const stand = readyStand(quad, 'quad-servo');

const asText = (files: Record<string, Uint8Array>) =>
  Object.fromEntries(Object.entries(files).map(([path, bytes]) => [path, new TextDecoder().decode(bytes)]));

const published = (skill: Skill, model: SimModel) =>
  asText(publishedSkillFiles({ skill, environment: kitEnvironment(model, 'stand'), model }));

async function install(files: Record<string, string>, model: SimModel, design: string, gain = 0) {
  const plan = installPlan(readPublishedSkill(files), model);
  const { jobs, forge } = stubForge(gain);
  const saved: string[] = [];
  const stop = new AbortController();
  const outcome = await trainKitEntry({
    mj: await loadMujoco(),
    design,
    model,
    entry: plan.entry,
    warm: plan.warm,
    seed: 1,
    signal: stop.signal,
    forge: (job) => {
      stop.abort();

      return forge(job);
    },
    save: (path) => {
      saved.push(path);

      return Promise.resolve();
    },
  });

  return { plan, jobs, saved, outcome };
}

describe('publishing a skill', () => {
  it('commits every listed file for a ready Stand, under a name from the robot and the skill', () => {
    const files = published(stand, quad);

    expect(Object.keys(files).sort()).toEqual([
      'README.md',
      'contract.json',
      'environment.json',
      'evidence.json',
      'policy.json',
      'robot.json',
      'skill.json',
    ]);
    expect(JSON.parse(files['skill.json'])).toEqual(stand);
    expect(skillRepoName(stand, quad)).toMatch(/^[a-z0-9-]+-stand-[0-9a-f]{6}$/);
  });

  it('writes a model card with the observation and action schema and the body class', () => {
    const card = published(stand, quad)['README.md'];

    expect(card).toContain('- Body class: legged, floating base');
    expect(card).toContain('- Joints: 12, in 4 limbs of 3');
    expect(card).toContain('| joint-positions | 12 |');
    expect(card).toContain('48 values in all.');
    expect(card).toContain('position-offset on 12 joints, scale 0.5, every 0.02 s:');
    expect(card).toContain('| held-out | 32 of 32 |');
    expect(card).toContain('**Install Skill**');
  });

  it('refuses a skill that never passed Arena', () => {
    const environment = kitEnvironment(quad, 'stand');

    expect(() => publishedSkillFiles({ skill: { ...stand, evidence: null }, environment, model: quad })).toThrow(
      'Only a skill that passed Arena can be published.',
    );
    expect(() =>
      publishedSkillFiles({
        skill: { ...stand, evidence: { ...stand.evidence!, passed: false } },
        environment,
        model: quad,
      }),
    ).toThrow('Only a skill that passed Arena can be published.');
  });
});

describe('reading a published skill', () => {
  it('refuses a policy.json whose hash doesn’t match skill.json', () => {
    const files = published(stand, quad);
    const policy = JSON.parse(files['policy.json']) as PolicySpec;
    const tampered = { ...policy, layers: [{ ...policy.layers[0], b: policy.layers[0].b.map(() => 1) }] };

    expect(() => readPublishedSkill({ ...files, 'policy.json': JSON.stringify(tampered) })).toThrow(
      'policy.json doesn’t match skill.json.',
    );
  });

  it('refuses a policy that isn’t data the runner can load, and files that aren’t JSON or are missing', () => {
    const files = published(stand, quad);
    const skill = JSON.parse(files['skill.json']) as Skill & { controller: { policy: PolicySpec } };
    const broken = {
      ...skill,
      controller: { ...skill.controller, policy: { ...skill.controller.policy, obsStd: [] } },
    };

    expect(() => readPublishedSkill({ ...files, 'skill.json': JSON.stringify(broken) })).toThrow(
      'Only a skill that runs a policy can be installed.',
    );
    expect(() => readPublishedSkill({ ...files, 'contract.json': '{' })).toThrow('contract.json isn’t JSON.');
    expect(() => readPublishedSkill({ ...files, 'robot.json': undefined })).toThrow('The repo has no robot.json.');
    expect(() => readPublishedSkill({ ...files, 'environment.json': files['contract.json'] })).toThrow(
      'environment.json doesn’t match skill.json.',
    );
  });

  it('takes model repo links only', () => {
    expect(skillLink('https://huggingface.co/tester/quad-stand')).toEqual({
      owner: 'tester',
      repo: 'quad-stand',
      rev: 'main',
    });
    expect(() => skillLink('https://huggingface.co/datasets/tester/quad-stand')).toThrow('model repo');
    expect(() => skillLink('https://huggingface.co.evil.com/tester/quad-stand')).toThrow('model repo');
    expect(() => skillLink('https://huggingface.co/../../etc')).toThrow('model repo');
  });
});

describe('mapping a skill onto another robot', () => {
  it('pairs each hexapod leg with the nearest quad leg, and refuses legs of another length', () => {
    const map = jointMap(robotSchema(quad), robotSchema(hexapod));
    const biped = jointMap(robotSchema(quad), robotSchema(fixtureModel('biped-servo')));
    const arm = jointMap(robotSchema(quad), robotSchema(fixtureModel('arm-3dof')));

    expect(map).toEqual({ ok: true, map: [0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] });
    expect(biped).toEqual({
      ok: false,
      problem: 'This skill moves limbs of 3 joints, and this robot has limbs of 4.',
    });
    expect(arm).toMatchObject({ ok: false, problem: 'This skill is for a legged robot, and this one is fixed-base.' });
    expect(() => installPlan(readPublishedSkill(published(stand, quad)), fixtureModel('biped-servo'))).toThrow(
      'This skill moves limbs of 3 joints, and this robot has limbs of 4.',
    );
  });

  it('acts on each mapped joint as the source acted on its leg', () => {
    const n = 2;
    const width = 12 + 3 * n;
    const source = {
      ...(stand.controller as { policy: PolicySpec }).policy,
      joints: ['a', 'b'],
      defaultPose: [0, 0],
      obsMean: Array.from({ length: width }, (_, i) => i / 10),
      obsStd: Array.from({ length: width }, (_, i) => 1 + i / 20),
      layers: [
        { in: width, out: 3, w: Array.from({ length: width * 3 }, (_, i) => Math.sin(i)), b: [0.1, -0.2, 0.3] },
        { in: 3, out: n, w: [0.5, -0.4, 0.3, 0.2, 0.1, -0.6], b: [0.05, -0.05] },
      ],
    };
    const map = [0, 1, 0];
    const mapped = mappedPolicy(source, map, { joints: ['x', 'y', 'z'], defaultPose: [0, 0, 0] });
    const base = [0, 0, -1, 0.1, 0.2, 0.3, 0, 0, 0, 0.2, 0, 0];
    const perJoint = (values: number[]) => [values[0], values[1], values[0]];
    const [pos, vel, last] = [
      [0.1, -0.2],
      [0.3, 0.4],
      [0.5, -0.5],
    ];
    const sourceAct = act(source, new Float32Array([...base, ...pos, ...vel, ...last]));
    const mappedAct = act(mapped, new Float32Array([...base, ...perJoint(pos), ...perJoint(vel), ...perJoint(last)]));

    expect([...mappedAct].map((v) => v.toFixed(5))).toEqual(map.map((s) => sourceAct[s].toFixed(5)));
  });
});

describe('installing a published skill', () => {
  it('installs quad-servo’s Stand on the hexapod and back, each proved on its own robot', async () => {
    const onHexapod = await install(published(stand, quad), hexapod, 'hexapod');
    const warmed = onHexapod.jobs[0].job.warmPolicy as PolicySpec;

    expect(onHexapod.plan.entry).toBe('stand');
    expect(warmed.joints).toHaveLength(18);
    expect(warmed.layers[0].in).toBe(12 + 3 * 18);
    expect(onHexapod.outcome.kind).toBe('skill');

    const hexStand = onHexapod.outcome.kind === 'skill' ? onHexapod.outcome.skill : null;

    expect(hexStand?.warmStartFrom).toBe(skillHash(stand));
    expect(hexStand?.evidence?.passed).toBe(true);
    expect(hexStand?.evidence?.binding.physics).toBe(modelHashes(hexapod).physics);
    expect(hexStand?.evidence).not.toEqual(stand.evidence);
    expect(onHexapod.saved).toEqual([`library/skills/${skillHash(hexStand!)}/skill.json`]);

    const back = await install(published(hexStand!, hexapod), quad, 'quad-servo');
    const quadStand = back.outcome.kind === 'skill' ? back.outcome.skill : null;

    expect(quadStand?.evidence?.passed).toBe(true);
    expect(quadStand?.warmStartFrom).toBe(skillHash(hexStand!));
    expect(quadStand?.evidence?.binding.physics).toBe(modelHashes(quad).physics);
  }, 120000);

  it('saves nothing when Arena refuses the result, and says how many tries passed', async () => {
    const refused = await install(published(stand, quad), hexapod, 'hexapod', 20);

    expect(refused.outcome.kind).toBe('refused');
    expect(refused.saved).toEqual([]);

    const evidence = refused.outcome.kind === 'refused' ? refused.outcome.evidence : null;

    expect(evidence?.passed).toBe(false);
    expect(refusedLine(evidence!)).toMatch(/^Refused in Arena: \d+ of 32 tries$/);
  }, 120000);
});
