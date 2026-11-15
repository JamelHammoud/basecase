import { afterEach, describe, expect, it, vi } from 'vitest';
import { hubBridge } from '../hub/hubBridge';
import { fixtureModel } from '../skills/fixtureModels';
import { publishedSkillFiles } from '../skills/hubSkill';
import { readyStand } from '../skills/hubSkillFixtures';
import { kitEnvironment } from '../skills/kitEnvironment';
import { rankSkills } from '../skills/skillRank';
import { robotSchema } from '../skills/robotSchema';
import { SKILL_HANDLERS } from './agentSkillRequests';

afterEach(() => vi.restoreAllMocks());

describe('find_skills payload', () => {
  it('returns the same ranking as Install Skill and accepts a name filter', async () => {
    const model = fixtureModel('quad-servo');
    const files = publishedSkillFiles({
      skill: readyStand(model, 'quad'),
      environment: kitEnvironment(model, 'stand'),
      model,
    });
    const candidates = [
      {
        repo: 'tester/stand',
        revision: 'a'.repeat(40),
        files: Object.fromEntries(
          Object.entries(files).map(([path, bytes]) => [path, new TextDecoder().decode(bytes)]),
        ),
      },
    ];
    const search = vi.spyOn(hubBridge, 'findSkills').mockResolvedValue(candidates);
    const ctx = { skills: { buildModel: async () => model } };

    expect(await SKILL_HANDLERS.skill_find({}, ctx)).toEqual({ skills: rankSkills(candidates, robotSchema(model)) });
    expect(await SKILL_HANDLERS.skill_find({ query: 'STAND' }, ctx)).toMatchObject({ skills: [{ name: 'Stand' }] });
    expect(await SKILL_HANDLERS.skill_find({ query: 'get up' }, ctx)).toEqual({ skills: [] });
    expect(search).toHaveBeenCalledTimes(3);
  });

  it('returns no stale candidates without a network', async () => {
    vi.spyOn(hubBridge, 'findSkills').mockRejectedValue(new Error('offline'));

    expect(
      await SKILL_HANDLERS.skill_find({}, { skills: { buildModel: async () => fixtureModel('quad-servo') } }),
    ).toEqual({ skills: [] });
  });
});
