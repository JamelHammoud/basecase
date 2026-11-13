import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { robotFacts } from '../cases/robotFit';
import { currentDesign, skillFiles, skillFromTraining, skillHash, type Skill } from '../skills/artifacts';
import { fixtureModel } from '../skills/fixtureModels';
import { kitEnvironment } from '../skills/kitEnvironment';
import type { KitOutcome } from '../skills/motorKit';
import type { SkillRunner } from '../skills/skillsClient';
import { stubTabEngine } from '../skills/skillsPlatform';
import { designOf } from '../skills/skillsRuntime';
import type { SkillRow } from '../skills/skillRows';
import { buildRig } from '../utils/kinematics';
import { galleryBundles } from './galleryEntries';
import { galleryTrainer } from './galleryTrainer';
import { seeInside } from './seeInside';
import { trainingOffered } from './trainingOffered';

const stored = vi.hoisted(() => new Map<string, unknown>());

vi.mock('../utils/platform/web/idb', () => ({
  idbGet: (store: string, key: string) => Promise.resolve(stored.get(`${store}/${key}`)),
  idbPut: (store: string, key: string, value: unknown) => Promise.resolve(void stored.set(`${store}/${key}`, value)),
  idbAll: () => Promise.resolve([]),
  idbDelete: () => Promise.resolve(),
}));

const hexapod = () => galleryBundles().find((b) => b.slug === 'hexapod-reach-the-flag')!;
const model = fixtureModel('hexapod');
const cost = { wallS: 1, steps: 1, forgeRuns: 1 };

const morphologyOf = ({ robot }: ReturnType<typeof hexapod>) =>
  robotFacts(buildRig(robot.joints, robot.parts), robot.parts).morphology;

function passedStand(): Skill {
  const environment = kitEnvironment(model, 'stand');
  const skill = skillFromTraining({
    name: 'Stand',
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
    expect(last()[0].state).toEqual({ kind: 'untrained' });
    expect(await made.carried()).toBeNull();
  });

  it('carries the trained skill into the scene Open Scene saves, record and skill file', async () => {
    const { made } = trainer((skill) => ({ kind: 'skill', skill, environment: kitEnvironment(model, 'stand'), cost }));
    const record = await made.train(model);
    const bundle = hexapod();

    await seeInside(bundle, (await made.carried()) ?? undefined);

    const scene = stored.get(`scenes/gallery-${bundle.slug}`) as { project: { skills?: unknown[]; cases?: unknown[] } };

    expect(scene.project.skills).toEqual([record]);
    expect(scene.project.cases).toHaveLength(1);
    expect(stored.get(`trained/skill:${record!.hash}`)).toEqual(passedStand());
    expect(location.assign).toHaveBeenCalledWith('/');
  });
});
