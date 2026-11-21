import loadMujoco from '@mujoco/mujoco';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { withServos } from '../sim/fixtures/servoLegs';
import { runArena } from './arena';
import { currentDesign, modelHashes, skillFreshness, skillHash } from './artifacts';
import { fixtureModel, modelOf } from './fixtureModels';
import type { ForgeJob } from './forgeRunner';
import { readyKitSource as readyStand, kitPolicy } from './kitSourceFixtures';
import { KIT_EDIT_ROBOTS, kitEditModels } from './kitEditFixtures';
import { kitEnvironment } from './kitEnvironment';
import { validationReport } from './kitValidation';
import { localKitWarm } from './localKitSource';
import { skillRecord } from './skillRecords';
import { runSkillsJob } from './skillsJob';

vi.mock('./arena', async (original) => ({ ...(await original<typeof import('./arena')>()), runArena: vi.fn() }));
vi.mock('./kitValidation', () => ({ validationReport: vi.fn() }));

let mj: Awaited<ReturnType<typeof loadMujoco>>;

beforeAll(async () => {
  mj = await loadMujoco();
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(runArena).mockImplementation(async ({ model }) => readyStand(model, model.robots[0].key).evidence!);
  vi.mocked(validationReport).mockImplementation(async ({ model }) => ({
    checks: [],
    score: 1,
    wallS: 0,
    transitions: {
      binding: {
        physics: modelHashes(model).physics,
        actuators: modelHashes(model).actuators,
        controllers: 'controlled',
      },
      checks: [],
      passed: true,
      reason: '',
      wallS: 0,
      simulatedS: 0,
      starts: { skill: 'motor-kit', joints: model.joints.map((joint) => joint.id), samples: [] },
    },
  }));
});

function cases(id: string) {
  const source = fixtureModel(id);
  const servo = (variant: string) => modelOf(withServos(id, { componentId: 'feetech-sts3215', variant }));

  return [
    ...kitEditModels(id)
      .filter((edit) => id !== 'biped-servo' || edit.name !== 'remove limb')
      .map((edit) => ({ ...edit, source })),
    { name: 'replace catalog servos', source: servo('c001'), model: servo('c018') },
  ];
}

describe.each(KIT_EDIT_ROBOTS)('%s edited models through the production training worker', (id) => {
  it.each(cases(id))('trains $name with a mapped seed and fresh target proof', async ({ source: original, model }) => {
    const source = readyStand(original, original.robots[0].key);
    const before = JSON.stringify(source);
    const warm = await localKitWarm({
      model,
      entry: 'stand',
      records: [skillRecord(source, { kit: 'stand', model: original })],
      load: async () => source,
    });
    const forge = vi.fn(async (job: ForgeJob) => ({
      ok: true,
      policy: kitPolicy(job.job),
      events: [{ type: 'done', steps: 20 }],
      stderr: '',
      run: 'policy-edit',
    }));
    const save = vi.fn(async () => {});
    const reply = await runSkillsJob(
      { type: 'kit', model, design: model.robots[0].key, entry: 'stand', warm, seed: 89 },
      { mj, forge, save },
    );

    expect(warm?.from).toBe(skillHash(source));
    expect(reply.type).toBe('kit');

    if (reply.type !== 'kit' || reply.outcome.kind !== 'skill') throw new Error(JSON.stringify(reply));

    const { skill, environment, cost } = reply.outcome;

    expect(forge.mock.calls[0][0].job.warmPolicy).toEqual(warm!.policy);
    expect(forge.mock.calls[0][0].xml).toBe(model.xml);
    expect(skill.warmStartFrom).toBe(skillHash(source));
    expect(cost.steps).toBe(forge.mock.calls.length * 20);
    expect(environment).toEqual(kitEnvironment(model, 'stand'));
    expect(skillFreshness(skill, currentDesign({ design: model.robots[0].key, model, environment }))).toBe('fresh');
    expect(save).toHaveBeenCalledOnce();
    expect(JSON.stringify(source)).toBe(before);
  });
});
