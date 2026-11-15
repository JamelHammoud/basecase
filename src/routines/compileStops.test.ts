import { describe, expect, it } from 'vitest';
import { compileRoutine } from './compile';
import { FIXTURE_MODEL_HASH, FIXTURE_SKILLS } from './fixtureSkills';
import { greetingRoutine } from './greeting';
import { withHandoffs } from './handoffs';
import { pairStamp } from './skillStamps';

describe('Routine stop proofs', () => {
  it('keeps the current stop failure when a stored proof belongs to older physics', () => {
    const failed = { seeds: 8, falls: 0, failures: 8, modelHash: FIXTURE_MODEL_HASH };
    const skills = FIXTURE_SKILLS.map((skill) =>
      skill.id === 'walk' ? { ...skill, transitions: { ...skill.transitions, settle: failed } } : skill,
    );
    const kit = { skills, modelHash: FIXTURE_MODEL_HASH, policies: [], drive: null };
    const stamp = pairStamp({ skills: [] }, { from: 'walk', to: 'settle' });
    const merged = withHandoffs(kit, {
      'walk->settle': { seeds: 8, falls: 0, modelHash: 'old-model', skills: stamp },
    });

    expect(merged.find((skill) => skill.id === 'walk')?.transitions.settle).toBe(failed);
    expect(compileRoutine(greetingRoutine(), { skills: merged, modelHash: kit.modelHash }).ok).toBe(false);
  });

  it.each([
    { seeds: 8, falls: 0, failures: 8, modelHash: FIXTURE_MODEL_HASH },
    { seeds: 8, falls: 1, failures: 0, modelHash: FIXTURE_MODEL_HASH },
    { seeds: 8, falls: 0, failures: 0, modelHash: 'old-model' },
    { seeds: 1, falls: 0, failures: 0, modelHash: FIXTURE_MODEL_HASH },
  ])('refuses implicit Walk stops without current passing evidence: %j', (proof) => {
    const skills = FIXTURE_SKILLS.map((skill) =>
      skill.id === 'walk' ? { ...skill, transitions: { ...skill.transitions, settle: proof } } : skill,
    );
    const result = compileRoutine(greetingRoutine(), { skills, modelHash: FIXTURE_MODEL_HASH });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'unproven-transition',
          path: 'walk',
          handoff: expect.objectContaining({ from: 'walk', to: 'settle' }),
        }),
      ]),
    );
  });
});
