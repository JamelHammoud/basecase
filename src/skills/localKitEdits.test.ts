import { describe, expect, it } from 'vitest';
import { act } from '../sim/policy';
import { withServos } from '../sim/fixtures/servoLegs';
import { currentDesign, skillFreshness, skillHash } from './artifacts';
import { fixtureModel, modelOf } from './fixtureModels';
import { readyKitSource as readyStand } from './kitSourceFixtures';
import { KIT_EDIT_ROBOTS, kitEditModels } from './kitEditFixtures';
import { kitEnvironment } from './kitEnvironment';
import { kitJob } from './kitJob';
import { localKitWarm } from './localKitSource';
import { isRunnablePolicy } from './policyCheck';
import { skillRecord } from './skillRecords';

describe.each(KIT_EDIT_ROBOTS)('local source mapping on generated %s edits', (id) => {
  const model = fixtureModel(id);
  const skill = readyStand(model, model.robots[0].key);
  const record = skillRecord(skill, { kit: 'stand', model });

  it('maps replacement catalog servos without inheriting actuator evidence', async () => {
    const previous = modelOf(withServos(id, { componentId: 'feetech-sts3215', variant: 'c001' }));
    const replacement = modelOf(withServos(id, { componentId: 'feetech-sts3215', variant: 'c018' }));
    const proven = readyStand(previous, previous.robots[0].key);
    const metadata = skillRecord(proven, { kit: 'stand', model: previous });
    const warm = await localKitWarm({
      model: replacement,
      entry: 'stand',
      records: [metadata],
      load: async () => proven,
    });

    expect(warm?.from).toBe(skillHash(proven));
    expect(
      skillFreshness(
        proven,
        currentDesign({
          design: previous.robots[0].key,
          model: replacement,
          environment: kitEnvironment(replacement, 'stand'),
        }),
      ),
    ).toBe('rerun-arena');
  });

  const edits = kitEditModels(id);
  const compatible = edits.filter((edit) => id !== 'biped-servo' || edit.name !== 'remove limb');

  it.each(compatible)('maps $name without moving source evidence', async ({ model: target }) => {
    const before = JSON.stringify(skill);
    const warm = await localKitWarm({ model: target, entry: 'stand', records: [record], load: async () => skill });
    const job = kitJob(target, 'stand', { minutes: 2, seed: 31 });

    expect(warm?.from).toBe(skillHash(skill));
    expect(isRunnablePolicy(warm?.policy)).toBe(true);
    expect(warm?.policy.joints).toEqual(job.joints.map((joint) => joint.id));
    expect(warm?.policy.defaultPose).toEqual(job.defaultPose);
    expect(warm?.policy.command).toEqual(job.command);
    expect(warm?.policy.actionScale).toBe(job.actionScale);
    expect(warm?.policy.controlDt).toBe(job.controlDt);
    expect([...act(warm!.policy, new Float32Array(warm!.policy.obsMean))].every(Number.isFinite)).toBe(true);
    expect(JSON.stringify(skill)).toBe(before);
    expect(
      skillFreshness(
        skill,
        currentDesign({ design: record.binding.design, model: target, environment: kitEnvironment(target, 'stand') }),
      ),
    ).not.toBe('fresh');
  });
});

it('refuses a biped with its only other leg removed because the generated model is no longer legged', async () => {
  const model = fixtureModel('biped-servo');
  const skill = readyStand(model, model.robots[0].key);
  const target = kitEditModels('biped-servo').find((edit) => edit.name === 'remove limb')!.model;

  expect(target.robots[0].morphology).toBe('fixed');
  expect(
    await localKitWarm({
      model: target,
      entry: 'stand',
      records: [skillRecord(skill, { kit: 'stand', model })],
      load: async () => skill,
    }),
  ).toBeUndefined();
});
