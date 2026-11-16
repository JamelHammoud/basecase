import { describe, expect, it } from 'vitest';
import { fixtureModel } from './fixtureModels';
import { publishedSkillFiles } from './hubSkill';
import { readyStand } from './hubSkillFixtures';
import { kitEnvironment } from './kitEnvironment';
import { SKILL_RANK_HANDLERS } from './skillRankJob';

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
