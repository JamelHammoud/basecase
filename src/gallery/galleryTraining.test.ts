import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { robotFacts } from '../cases/robotFit';
import { currentDesign, skillFiles, skillFromTraining, skillHash, type Skill } from '../skills/artifacts';
import { fixtureModel } from '../skills/fixtureModels';
import { driveAccess } from '../sim/driveAccess';
import { kitTopSpeed } from '../skills/kitModel';
import { kitEnvironment, type TrainedEntry } from '../skills/kitEnvironment';
import { readyStand } from '../skills/hubSkillFixtures';
import { installPlan } from '../skills/hubSkill';
import { robotSchema } from '../skills/robotSchema';
import { KIT_LABELS } from '../skills/skillRows';
import { kitSkillName, type KitOutcome } from '../skills/motorKit';
import type { SkillRunner } from '../skills/skillsClient';
import type { SkillsJob, SkillPorts } from '../skills/skillsJob';
import { stubTabEngine } from '../skills/skillsPlatform';
import { designOf } from '../skills/skillsRuntime';
import type { SkillRow } from '../skills/skillRows';
import { buildRig } from '../utils/kinematics';
import { galleryBundles } from './galleryEntries';
import { galleryTrainer } from './galleryTrainer';
import { openGalleryScene } from './openGalleryScene';
import { trainingOffered } from './trainingOffered';

const stored = vi.hoisted(() => new Map<string, unknown>());

vi.mock('../utils/platform/web/idb', () => ({
  idbGet: (store: string, key: string) => Promise.resolve(stored.get(`${store}/${key}`)),
  idbPut: (store: string, key: string, value: unknown) => Promise.resolve(void stored.set(`${store}/${key}`, value)),
  idbAll: () => Promise.resolve([]),
  idbDelete: () => Promise.resolve(),
  idbWrite: (changes: Array<{ store: string; key: string; kind: string; value?: unknown }>) => {
    for (const change of changes) {
      if (change.kind === 'delete') stored.delete(`${change.store}/${change.key}`);
      else stored.set(`${change.store}/${change.key}`, change.value);
    }

    return Promise.resolve();
  },
}));

const hexapod = () => galleryBundles().find((b) => b.slug === 'hexapod-reach-the-flag')!;
const model = fixtureModel('hexapod');
const cost = { wallS: 1, steps: 1, forgeRuns: 1 };

const morphologyOf = ({ robot }: ReturnType<typeof hexapod>) =>
  robotFacts(buildRig(robot.joints, robot.parts), robot.parts).morphology;

function passedStand(entry: TrainedEntry = 'stand'): Skill {
  const environment = kitEnvironment(model, entry);
  const skill = skillFromTraining({
    name: KIT_LABELS[entry],
    start: null,
    current: currentDesign({ design: designOf(model), model, environment }),
    environment,
    controller: { kind: 'hold' },
  });
  const { contract, physics, actuators } = skill.binding;
  const variant = { trials: 32, passes: 32, lowerBound: 0.91, diverged: 0, failures: {} };

  return {
    ...skill,
    evidence: {
      arenaVersion: 1,
      binding: { contract, physics, actuators, environment: 'e'.repeat(64) },
      confidence: 0.95,
      bar: 0.75,
      variants: [{ variant: 'held-out', ...variant }],
      lowerBound: 0.91,
      passed: true,
      conditions: [],
      summary: 'Passed 32 of 32',
      saltCommitment: 'f'.repeat(64),
    },
  };
}

function kitRunner(outcome: (skill: Skill) => KitOutcome): SkillRunner {
  return (async (_job, ports) => {
    const skill = passedStand();

    await ports.forge({ name: 'Motor Kit: stand', xml: model.xml, job: { minutes: 1 } });

    const reply = outcome(skill);

    if (reply.kind === 'skill') await ports.save(skillFiles(skillHash(skill)).skill, JSON.stringify(skill));

    return { type: 'kit', outcome: reply };
  }) as SkillRunner;
}

function trainer(outcome: (skill: Skill) => KitOutcome) {
  const rows: SkillRow[][] = [];
  const made = galleryTrainer({ slug: hexapod().slug, onRows: (r) => rows.push(r), runner: kitRunner(outcome) });

  return { made, rows, last: () => rows.at(-1) ?? [] };
}

beforeEach(() => {
  stored.clear();
  stubTabEngine((options) => () => {
    options.onEvent?.({ type: 'status', message: 'Using the WGSL engine' });

    return Promise.resolve({ ok: true, policy: null, events: [], stderr: '', run: 'stub-1' });
  });
  vi.stubGlobal('location', { assign: vi.fn() });
});

afterEach(() => {
  stubTabEngine(null);
  vi.unstubAllGlobals();
});

describe('Train on a gallery Case card', () => {
  it('shows only for a legged robot, and only when the browser has a GPU adapter', async () => {
    const adapter = vi.fn(() => Promise.resolve(true));
    const legged = galleryBundles().filter((b) => morphologyOf(b) === 'legged');

    expect(legged.map((b) => b.slug)).toEqual(['hexapod-reach-the-flag']);
    expect(await trainingOffered(morphologyOf(hexapod()), adapter)).toBe(true);
    expect(await trainingOffered(morphologyOf(hexapod()), () => Promise.resolve(false))).toBe(false);

    for (const bundle of galleryBundles().filter((b) => morphologyOf(b) !== 'legged'))
      expect(await trainingOffered(morphologyOf(bundle), adapter)).toBe(false);

    expect(adapter).toHaveBeenCalledTimes(1);
  });

  it('trains Stand through the skills runtime, one row from Starting to ready', async () => {
    const { made, rows, last } = trainer((skill) => ({
      kind: 'skill',
      skill,
      environment: kitEnvironment(model, 'stand'),
      cost,
    }));
    const record = await made.train(model);

    expect(record).toMatchObject({ kit: 'stand', hash: skillHash(passedStand()) });
    expect(rows.every((r) => r.length === 1 && r[0].label === 'Stand')).toBe(true);
    expect(rows[0][0].state.kind).toBe('training');
    expect(last()[0].state).toEqual({ kind: 'ready', arena: '32 of 32 tries, at least 91%' });
    expect(made.events()).toEqual([{ type: 'status', message: 'Using the WGSL engine' }]);
    expect(await made.skill(record!)).toEqual(passedStand());
  });

  it('leaves the row untrained with Train again when Arena refuses', async () => {
    const { made, last } = trainer(() => ({ kind: 'refused', reason: 'No Stand passed.', relaxation: null, cost }));

    expect(await made.train(model)).toBeNull();
    expect(last()[0].state).toEqual({ kind: 'untrained', refused: 'No Stand passed.' });
    expect(await made.carried()).toBeNull();
  });
});

describe('Install on a gallery Case card', () => {
  it.each<TrainedEntry>(['stand', 'settle-to-neutral'])(
    'installs %s through the runtime and carries fresh target evidence into Open Scene',
    async (entry) => {
      const sourceModel = fixtureModel('quad-servo');
      const source = readyStand(sourceModel, 'source');

      source.name = kitSkillName(entry);

      if (source.controller.kind !== 'policy') throw new Error('Expected a policy.');

      const plan = installPlan(
        {
          skill: { ...source, controller: source.controller },
          environment: kitEnvironment(sourceModel, entry),
          schema: robotSchema(sourceModel),
        },
        model,
      );
      const jobs: unknown[] = [];
      const installed = passedStand(entry);
      const runner = (async (job, ports) => {
        jobs.push(job);
        await ports.save(skillFiles(skillHash(installed)).skill, JSON.stringify(installed));

        return {
          type: 'kit',
          outcome: { kind: 'skill', skill: installed, environment: kitEnvironment(model, entry), cost },
        };
      }) as SkillRunner;
      const rows: SkillRow[][] = [];
      const made = galleryTrainer({ slug: hexapod().slug, onRows: (next) => rows.push(next), runner });
      const onOutcome = vi.fn();
      const record = await made.install(model, { ...plan, onOutcome });

      expect(jobs).toEqual([expect.objectContaining({ type: 'kit', entry, warm: plan.warm })]);
      expect(record).toMatchObject({ kit: entry, binding: installed.binding, evidence: installed.evidence });
      expect(rows.at(-1)?.[0]).toMatchObject({ label: KIT_LABELS[entry], state: { kind: 'ready' } });
      expect(onOutcome).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'passed', evidence: installed.evidence }),
      );
      await openGalleryScene(hexapod(), (await made.carried())!);
      expect(stored.get(`trained/skill:${record!.hash}`)).toEqual(installed);
    },
  );

  it('keeps the previously retained skill when another installation is refused', async () => {
    const stand = passedStand();
    const runner = (async (job: SkillsJob, ports: SkillPorts) => {
      if (job.type !== 'kit' || job.entry !== 'stand')
        return { type: 'kit', outcome: { kind: 'refused', reason: 'No Settle passed.', relaxation: null, cost } };

      await ports.save(skillFiles(skillHash(stand)).skill, JSON.stringify(stand));

      return {
        type: 'kit',
        outcome: { kind: 'skill', skill: stand, environment: kitEnvironment(model, 'stand'), cost },
      };
    }) as SkillRunner;
    const made = galleryTrainer({ slug: hexapod().slug, onRows: () => {}, runner });
    const record = await made.train(model);
    const source = readyStand(model, 'source');

    if (source.controller.kind !== 'policy') throw new Error('Expected a policy.');

    expect(
      await made.install(model, {
        entry: 'settle-to-neutral',
        warm: { from: skillHash(source), policy: source.controller.policy },
      }),
    ).toBeNull();
    expect(await made.carried()).toEqual({ kind: 'skill', record, skill: stand });
  });

  it('keeps ready entries available and carries the skill selected by Try', async () => {
    const rows: SkillRow[][] = [];
    const runner = (async (job: SkillsJob, ports: SkillPorts) => {
      if (job.type !== 'kit') throw new Error('Expected a Kit job.');

      const skill = passedStand(job.entry);

      await ports.save(skillFiles(skillHash(skill)).skill, JSON.stringify(skill));

      return { type: 'kit', outcome: { kind: 'skill', skill, environment: kitEnvironment(model, job.entry), cost } };
    }) as SkillRunner;
    const made = galleryTrainer({ slug: hexapod().slug, onRows: (next) => rows.push(next), runner });
    const stand = await made.train(model);
    const source = readyStand(model, 'source');

    if (source.controller.kind !== 'policy') throw new Error('Expected a policy.');

    const settle = await made.install(model, {
      entry: 'settle-to-neutral',
      warm: { from: skillHash(source), policy: source.controller.policy },
    });

    expect(rows.at(-1)?.map((row) => row.kit)).toEqual(['stand', 'settle-to-neutral']);
    expect(await made.carried()).toMatchObject({ record: settle });
    await made.skill(stand!);
    expect(await made.carried()).toMatchObject({ record: stand });
  });

  it('carries the trained skill into the scene Open Scene saves, record and skill file', async () => {
    const { made } = trainer((skill) => ({ kind: 'skill', skill, environment: kitEnvironment(model, 'stand'), cost }));
    const record = await made.train(model);
    const bundle = hexapod();

    await openGalleryScene(bundle, (await made.carried()) ?? undefined);

    const scene = stored.get(`scenes/gallery-${bundle.slug}`) as { project: { skills?: unknown[]; cases?: unknown[] } };

    expect(scene.project.skills).toEqual([record]);
    expect(scene.project.cases).toHaveLength(1);
    expect(stored.get(`sceneSummaries/gallery-${bundle.slug}`)).toMatchObject({
      id: `gallery-${bundle.slug}`,
      partCount: bundle.robot.parts.length,
    });
    expect(stored.get(`trained/skill:${record!.hash}`)).toEqual(passedStand());
    expect(location.assign).toHaveBeenCalledWith('/');
  });
});

describe('Drive an installed gallery Walk', () => {
  it('supplies the retained ready velocity policy to the normal Drive controller', async () => {
    const source = readyStand(model, 'source');

    if (source.controller.kind !== 'policy') throw new Error('Expected a policy.');

    const controller = source.controller;
    const skill = { ...passedStand('velocity-tracking'), controller };
    const runner = (async (_job, ports) => {
      await ports.save(skillFiles(skillHash(skill)).skill, JSON.stringify(skill));

      return {
        type: 'kit',
        outcome: { kind: 'skill', skill, environment: kitEnvironment(model, 'velocity-tracking'), cost },
      };
    }) as SkillRunner;
    const made = galleryTrainer({ slug: hexapod().slug, onRows: () => {}, runner });

    expect(await made.velocity()).toBeNull();

    const record = await made.install(model, {
      entry: 'velocity-tracking',
      warm: { from: skillHash(source), policy: controller.policy },
    });
    const velocity = await made.velocity();
    const bundle = hexapod();
    const access = driveAccess({
      model,
      rig: buildRig(bundle.robot.joints, bundle.robot.parts),
      parts: bundle.robot.parts,
      velocity,
    });

    expect(velocity).toEqual({ policy: controller.policy, topSpeed: kitTopSpeed(model) });
    expect(access).toMatchObject({ kind: 'policy', velocity });
    expect(await made.carried()).toMatchObject({ record });
  });
});
