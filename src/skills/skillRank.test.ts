import { describe, expect, it } from 'vitest';
import { fixtureModel } from './fixtureModels';
import { publishedSkillFiles } from './hubSkill';
import { readyStand } from './hubSkillFixtures';
import { hashOf } from './hash';
import { kitEnvironment } from './kitEnvironment';
import { robotSchema, type RobotSchema } from './robotSchema';
import { rankSkills, type SkillCandidate } from './skillRank';

function candidate(id: string, repo = id): SkillCandidate {
  const model = fixtureModel(id);
  const files = publishedSkillFiles({
    skill: readyStand(model, id),
    environment: kitEnvironment(model, 'stand'),
    model,
  });

  return {
    repo: `tester/${repo}`,
    revision: 'a'.repeat(40),
    files: Object.fromEntries(
      ['skill.json', 'robot.json'].map((path) => [path, new TextDecoder().decode(files[path])]),
    ),
  };
}

describe('published skills ranked for a robot', () => {
  it('ranks fitting quad Stand above a refused biped on the hexapod, with a stable order', () => {
    const candidates = [candidate('biped-servo'), candidate('quad-servo', 'z'), candidate('quad-servo', 'a')];
    const target = robotSchema(fixtureModel('hexapod'));
    const ranked = rankSkills(candidates, target);

    expect(ranked.map((r) => r.repo)).toEqual(['tester/a', 'tester/z', 'tester/biped-servo']);
    expect(ranked[0].fit.ok).toBe(true);
    expect(ranked[2].fit).toEqual({
      ok: false,
      problem: 'This skill moves limbs of 4 joints, and this robot has limbs of 3.',
    });
    expect(rankSkills([...candidates].reverse(), target)).toEqual(ranked);
  });

  it('puts SO-101 reach before a six-joint arm and uses Arena passes after anchor distance', () => {
    const source = candidate('quad-servo');
    const schema = (depth: number, x = 0): RobotSchema => ({
      format: 'basecase-robot-schema',
      version: 1,
      bodyClass: 'fixed',
      floating: false,
      limbs: [[x, 0]],
      joints: Array.from({ length: depth }, (_, i) => ({ id: `j${i}`, limb: 0, depth: i + 1 })),
    });
    const arm = (repo: string, depth: number, x = 0) => {
      const skill = JSON.parse(source.files['skill.json']);
      const joints = schema(depth).joints.map((j) => j.id);
      const n = 12 + 3 * depth;

      skill.name = 'Reach';
      skill.action.joints = joints;
      skill.binding.action = hashOf(skill.action);
      skill.controller.policy = {
        ...skill.controller.policy,
        joints,
        defaultPose: joints.map(() => 0),
        obsMean: new Array(n).fill(0),
        obsStd: new Array(n).fill(1),
        layers: [{ in: n, out: depth, w: new Array(n * depth).fill(0), b: joints.map(() => 0) }],
      };

      return {
        ...source,
        repo,
        files: { 'robot.json': JSON.stringify(schema(depth, x)), 'skill.json': JSON.stringify(skill) },
      };
    };
    const so101 = arm('tester/so-101-reach', 5);
    const offset = arm('tester/offset-reach', 5, 1);
    const six = arm('tester/6-dof-reach', 6);

    expect(rankSkills([six, offset, so101], schema(5)).map((r) => r.repo)).toEqual([so101.repo, offset.repo, six.repo]);

    const lower = candidate('quad-servo', 'lower');
    const skill = JSON.parse(lower.files['skill.json']);

    skill.evidence.variants.forEach((v: { passes: number }) => (v.passes = 29));
    lower.files['skill.json'] = JSON.stringify(skill);
    expect(rankSkills([lower, source], robotSchema(fixtureModel('hexapod'))).map((r) => r.repo)).toEqual([
      source.repo,
      lower.repo,
    ]);
  });

  it('drops malformed files, mismatched joints, bad evidence bindings and unusable policies', () => {
    const good = candidate('quad-servo');
    const mutate = (change: (skill: ReturnType<typeof JSON.parse>) => void) => {
      const skill = JSON.parse(good.files['skill.json']);

      change(skill);

      return { ...good, files: { ...good.files, 'skill.json': JSON.stringify(skill) } };
    };
    const bad = [
      { ...good, files: { ...good.files, 'robot.json': '{' } },
      mutate((s) => (s.action.joints = ['wrong'])),
      mutate((s) => (s.evidence.binding.physics = '0'.repeat(64))),
      mutate((s) => (s.controller.policy.obsStd = [])),
      mutate((s) => (s.evidence.variants[0].passes = 33)),
      mutate((s) => (s.evidence.variants[0].passes = 0)),
    ];

    expect(rankSkills(bad, robotSchema(fixtureModel('hexapod')))).toEqual([]);
  });
});
