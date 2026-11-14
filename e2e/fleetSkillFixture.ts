import type { SimModel } from '../src/sim/mjcfTypes';
import { currentDesign, skillFromTraining, withEvidence, type ArenaEvidence } from '../src/skills/artifacts';
import { environmentHash } from '../src/skills/environment';
import { hashOf } from '../src/skills/hash';
import { skillRecord } from '../src/skills/skillRecords';
import { designOf } from '../src/skills/skillsRuntime';
import { draftEnvironment } from '../src/skills/teachEnvironment';
import { holdingPolicy } from '../src/skills/hubSkillFixtures';

export function fleetSkillFixture(model: SimModel, name = 'Reach') {
  const environment = draftEnvironment(model, {
    name,
    request: 'Hold the shoulder',
    goal: { kind: 'open' },
    seconds: 0.5,
    contract: {
      version: 1,
      success: {
        always: { window: 'whole', state: { atom: { expr: { signal: 'time' }, cmp: '<', value: 1, scale: 1 } } },
      },
      failures: [],
    },
  });
  const current = currentDesign({ design: designOf(model), model, environment });
  const policy = holdingPolicy({
    joints: environment.action.joints.map((id) => ({ id })),
    robotName: environment.robot,
    defaultPose: environment.action.joints.map(() => 0),
    actionScale: environment.action.scale,
    controlDt: environment.action.controlDt,
    command: [0, 0, 0],
  });
  const trained = skillFromTraining({
    name,
    start: null,
    current,
    environment,
    controller: { kind: 'policy', policy, robot: environment.robot },
  });
  const evidence: ArenaEvidence = {
    arenaVersion: 1,
    binding: { ...current.hashes, contract: current.contract, environment: environmentHash(environment) },
    confidence: 0.95,
    bar: 0.75,
    variants: [{ variant: 'held-out', trials: 32, passes: 32, lowerBound: 0.91, diverged: 0, failures: {} }],
    lowerBound: 0.91,
    passed: true,
    conditions: [],
    summary: '',
    saltCommitment: hashOf('fleet-fixture'),
  };
  const skill = withEvidence(trained, evidence, environment);

  return { skill, record: skillRecord(skill, { kit: null, environment }) };
}
