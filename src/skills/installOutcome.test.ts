import { describe, expect, it } from 'vitest';
import { fixtureModel } from './fixtureModels';
import { readyStand } from './hubSkillFixtures';
import { publishedSkillFiles } from './hubSkill';
import { kitEnvironment } from './kitEnvironment';
import { robotSchema } from './robotSchema';
import { rankSkills } from './skillRank';
import { produceInstallOutcome, reportedInstallScore } from './installOutcome';

const sourceModel = fixtureModel('quad-servo');
const skill = readyStand(sourceModel, 'source');
const source = { repo: 'tester/z', revision: 'a'.repeat(40), skill, schema: robotSchema(sourceModel) };
const model = fixtureModel('hexapod');
const environment = kitEnvironment(model, 'stand');
const evidence = readyStand(model, 'target').evidence!;
const record = () => produceInstallOutcome({ source, model, environment, status: 'passed', evidence });
const score = (records: unknown[], target = robotSchema(model)) => reportedInstallScore(records, source, target);

describe('reported installation outcomes', () => {
  it('uses quad-to-hex outcomes for another hexapod', () => expect(score([record()])).toBeGreaterThan(0));
  it('uses same-body outcomes', () => expect(score([record()], robotSchema(sourceModel))).toBeGreaterThan(0));
  it('does not use leg outcomes for an arm', () => {
    expect(score([record()], robotSchema(fixtureModel('arm-3dof')))).toBe(0);
  });
  it('refuses incompatible limb depths', () => {
    expect(score([record()], robotSchema(fixtureModel('biped-servo')))).toBe(0);
  });
  it('counts failed Arena runs against a source', () => {
    const failed = structuredClone(evidence);

    failed.passed = false;
    failed.variants[0].passes = 0;
    expect(
      score([produceInstallOutcome({ source, model, environment, status: 'failed', evidence: failed })]),
    ).toBeLessThan(0);
  });
  it.each(['cancelled', 'infrastructure'] as const)('keeps %s distinct without a ranking penalty', (status) => {
    const outcome = produceInstallOutcome({ source, model, environment, status });

    expect(outcome.status).toBe(status);
    expect(score([outcome])).toBe(0);
  });
  it('deduplicates repeat reports', () => {
    const outcome = record();

    expect(score([outcome, outcome])).toBe(score([outcome]));
  });
  it('preserves scores when discovery order changes', () => {
    const reports = [record(), record(), record()];

    reports[1].target.schema.limbs[0][0] += 0.123;
    expect(score(reports)).toBe(score([...reports].reverse()));
  });
  it('keeps separate attempts distinct', () => expect(record().attempt).not.toBe(record().attempt));
  it('ignores stale Arena evidence', () => {
    const outcome = record();

    outcome.evidence!.arenaVersion++;
    expect(score([outcome])).toBe(0);
  });
  it('ignores forged physics and contract bindings', () => {
    const outcome = record();

    outcome.evidence!.binding.physics = '0'.repeat(64);
    expect(score([outcome])).toBe(0);
    outcome.target.binding.contract = '0'.repeat(64);
    expect(score([outcome])).toBe(0);
  });
  it('ignores changed source revisions and skill hashes', () => {
    expect(reportedInstallScore([record()], { ...source, revision: 'b'.repeat(40) }, robotSchema(model))).toBe(0);
    expect(
      reportedInstallScore([record()], { ...source, skill: { ...skill, name: 'Other' } }, robotSchema(model)),
    ).toBe(0);
  });
  it('ignores malformed and unavailable feedback', () => expect(score([null, {}, '{'])).toBe(0));
  it('rejects sparse limb depths before allocating joint maps', () => {
    const outcome = record();

    outcome.target.schema.joints[0].depth = 2 ** 32 - 2;
    expect(score([outcome])).toBe(0);
  });
  it('changes ordering while keeping incompatible candidates last and ties deterministic', () => {
    const files = Object.fromEntries(
      Object.entries(
        publishedSkillFiles({ skill, environment: kitEnvironment(sourceModel, 'stand'), model: sourceModel }),
      ).map(([p, b]) => [p, new TextDecoder().decode(b)]),
    );
    const candidates = ['tester/a', source.repo].map((repo) => ({ repo, revision: source.revision, files }));

    expect(rankSkills(candidates, robotSchema(model)).map((r) => r.repo)).toEqual(['tester/a', source.repo]);
    expect(rankSkills(candidates, robotSchema(model), [record()]).map((r) => r.repo)).toEqual([
      source.repo,
      'tester/a',
    ]);
  });
});
