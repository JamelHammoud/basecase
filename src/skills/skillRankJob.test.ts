import { describe, expect, it } from 'vitest';
import { fixtureModel } from './fixtureModels';
import { publishedSkillFiles } from './hubSkill';
import { readyStand } from './hubSkillFixtures';
import { kitEnvironment } from './kitEnvironment';
import { SKILL_RANK_HANDLERS } from './skillRankJob';
import { readyKitSource } from './kitSourceFixtures';
import { skillRecord } from './skillRecords';
import { isTrainablePolicy } from './policyCheck';

function sourceFiles() {
  const model = fixtureModel('quad-servo');
  const files = publishedSkillFiles({
    model,
    skill: readyStand(model, 'quad-servo'),
    environment: kitEnvironment(model, 'stand'),
  });

  return Object.fromEntries(Object.entries(files).map(([path, bytes]) => [path, new TextDecoder().decode(bytes)]));
}

describe('installation preparation in the ranking worker', () => {
  it('validates and maps one selected local artifact before the training request is frozen', () => {
    const source = fixtureModel('quad-servo');
    const model = fixtureModel('hexapod');
    const skill = readyKitSource(source);
    const record = skillRecord(skill, { kit: 'stand', model: source });
    const before = JSON.stringify(skill);
    const { result } = SKILL_RANK_HANDLERS.prepareLocalKit({ model, record, skill });

    expect(result?.from).toBe(record.hash);
    expect(isTrainablePolicy(result?.policy)).toBe(true);
    expect(result?.policy.joints).toEqual(kitEnvironment(model, 'stand').action.joints);
    expect(JSON.stringify(skill)).toBe(before);
    expect(
      SKILL_RANK_HANDLERS.prepareLocalKit({ model, record: { ...record, hash: 'a'.repeat(64) }, skill }).result,
    ).toBeUndefined();
  });
  it('checks the package and maps its policy onto the target robot', () => {
    const model = fixtureModel('hexapod');
    const { result } = SKILL_RANK_HANDLERS.prepareInstall({ files: sourceFiles(), model });

    expect(result.plan.entry).toBe('stand');
    expect(result.plan.warm.policy.joints).toEqual(kitEnvironment(model, 'stand').action.joints);
    expect(result.published.schema.joints).toHaveLength(12);
  });

  it('refuses tampered policy bytes before training can start', () => {
    const files = { ...sourceFiles(), 'policy.json': '{}' };

    expect(() => SKILL_RANK_HANDLERS.prepareInstall({ files, model: fixtureModel('hexapod') })).toThrow(
      'policy.json doesn’t match skill.json.',
    );
  });
});
