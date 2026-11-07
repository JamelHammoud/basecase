import { describe, expect, it } from 'vitest';
import { decodeSceneFile, encodeSceneFile } from '../utils/sceneFile';
import { withTimestep } from './arenaWorld';
import {
  bindingFor,
  currentDesign,
  modelHashes,
  skillFolder,
  skillFreshness,
  skillFromTraining,
  skillHash,
  warmStart,
  withEvidence,
  type ArenaEvidence,
  type CurrentDesign,
  type Skill,
} from './artifacts';
import type { Contract } from './contract';
import { environmentHash, policyObservation, type Environment } from './environment';
import { editParts, fixtureRobot, modelOf } from './fixtureModels';
import { sha256Hex } from './hash';

const quad = fixtureRobot('quad-servo');
const base = modelOf(quad);
const joints = quad.joints.map((j) => j.id);
const contract: Contract = {
  version: 1,
  success: {
    always: { window: 'whole', state: { atom: { expr: { signal: 'h' }, cmp: '>', value: 0.05, scale: 0.05 } } },
  },
  failures: [],
};
const environment: Environment = {
  version: 1,
  robot: base.robots[0].key,
  horizonS: 4,
  traceDt: 0.02,
  observation: policyObservation(joints),
  action: { kind: 'position-offset', joints, scale: 0.25, controlDt: 0.02 },
  reset: { jointNoiseDeg: 2, baseYawDeg: 180, baseOffsetMm: 0 },
  randomization: { friction: [0.6, 1.3], mass: [0.85, 1.15], strength: [0.85, 1.15], latencyMs: [0, 20] },
  reward: { kind: 'contract-robustness' },
  contract,
  signals: { h: { kind: 'base-height' } },
};

function trainedSkill(current: CurrentDesign): Skill {
  const skill = skillFromTraining({ name: 'Stand', start: null, current, environment, controller: { kind: 'hold' } });
  const evidence: ArenaEvidence = {
    arenaVersion: 1,
    binding: {
      contract: current.contract,
      physics: current.hashes.physics,
      actuators: current.hashes.actuators,
      environment: environmentHash(environment),
    },
    confidence: 0.95,
    bar: 0.75,
    variants: [],
    lowerBound: 0.9,
    passed: true,
    conditions: [],
    summary: 'Passed in simulation.',
    saltCommitment: sha256Hex('salt'),
  };

  return withEvidence(skill, evidence, environment);
}

const designOf = (robot = quad, design = 'scene-1/quad') =>
  currentDesign({ design, model: modelOf(robot), environment });

describe('model hashes', () => {
  it('ignore a colour change, a rename and a light', () => {
    const recoloured = modelOf(editParts(quad, (p) => ({ ...p, color: '#ff0000', name: `${p.name} renamed` })));
    const lit = { ...base, xml: base.xml.replace('<light ', '<light castshadow="false" ') };

    expect(modelHashes(recoloured)).toEqual(modelHashes(base));
    expect(modelHashes(lit)).toEqual(modelHashes(base));
  });

  it('see a mass or size change in physics only', () => {
    const heavier = modelHashes(modelOf(editParts(quad, (p) => (p.id === 'body' ? { ...p, massG: 900 } : p))));
    const wider = modelHashes(
      modelOf(editParts(quad, (p) => (p.id === 'body' ? { ...p, dimensions: { ...p.dimensions, width: 200 } } : p))),
    );
    const before = modelHashes(base);

    for (const after of [heavier, wider]) {
      expect(after.physics).not.toBe(before.physics);
      expect(after.topology).toBe(before.topology);
      expect(after.actuators).toBe(before.actuators);
    }
  });

  it('see a servo change in actuators, and a timestep change in physics', () => {
    const stronger = modelHashes(modelOf({ ...quad, joints: quad.joints.map((j) => ({ ...j, effortNm: 3 })) }));
    const finer = modelHashes(withTimestep(base, 0.5));

    expect(stronger.actuators).not.toBe(modelHashes(base).actuators);
    expect(stronger.topology).toBe(modelHashes(base).topology);
    expect(finer.physics).not.toBe(modelHashes(base).physics);
  });

  it('see a removed leg or a flipped axis in topology', () => {
    const threeLegs = { ...quad, joints: quad.joints.filter((j) => !j.id.startsWith('leg3')) };
    const flipped = {
      ...quad,
      joints: quad.joints.map((j) =>
        j.id === 'leg0_bend' ? { ...j, axis: [-1, 0, 0] as [number, number, number] } : j,
      ),
    };

    expect(modelHashes(modelOf(threeLegs)).topology).not.toBe(modelHashes(base).topology);
    expect(modelHashes(modelOf(flipped)).topology).not.toBe(modelHashes(base).topology);
  });
});

describe('skill freshness', () => {
  const skill = trainedSkill(designOf());

  it('is fresh on the design it was proved on, and after a visual edit', () => {
    expect(skillFreshness(skill, designOf())).toBe('fresh');
    expect(skillFreshness(skill, designOf(editParts(quad, (p) => ({ ...p, color: '#00ff00' }))))).toBe('fresh');
  });

  it('reruns Arena after a mass, size or servo edit', () => {
    const heavier = editParts(quad, (p) => (p.id === 'body' ? { ...p, massG: 950 } : p));
    const longer = editParts(quad, (p) =>
      p.id.endsWith('_lower') ? { ...p, dimensions: { ...p.dimensions, height: 80 } } : p,
    );
    const stronger = { ...quad, joints: quad.joints.map((j) => ({ ...j, effortNm: 2.5 })) };

    for (const robot of [heavier, longer, stronger]) expect(skillFreshness(skill, designOf(robot))).toBe('rerun-arena');
  });

  it('reruns Arena when the contract changed or there is no evidence', () => {
    const changed = { ...designOf(), contract: sha256Hex('another contract') };

    expect(skillFreshness(skill, changed)).toBe('rerun-arena');
    expect(skillFreshness({ ...skill, evidence: null }, designOf())).toBe('rerun-arena');
  });

  it('needs training after a topology edit or with failed evidence', () => {
    const threeLegs = { ...quad, joints: quad.joints.filter((j) => !j.id.startsWith('leg3')) };

    expect(skillFreshness(skill, designOf(threeLegs))).toBe('needs-training');
    expect(skillFreshness({ ...skill, evidence: { ...skill.evidence!, passed: false } }, designOf())).toBe(
      'needs-training',
    );
  });

  it('never carries verified to another design, even an identical one, and warm-starts instead', () => {
    const elsewhere = designOf(quad, 'scene-2/quad');
    const seed = warmStart(skill, elsewhere);
    const retrained = skillFromTraining({
      name: 'Stand',
      start: seed,
      current: elsewhere,
      environment,
      controller: seed.controller,
    });

    expect(skillFreshness(skill, elsewhere)).toBe('needs-training');
    expect(seed.from).toBe(skillHash(skill));
    expect(seed.binding).toEqual(bindingFor(elsewhere));
    expect(retrained.evidence).toBeNull();
    expect(retrained.warmStartFrom).toBe(skillHash(skill));
    expect(skillFreshness(retrained, elsewhere)).toBe('rerun-arena');
  });

  it('refuses evidence from another environment', () => {
    const other = { ...environment, horizonS: 8 };
    const bare = skillFromTraining({
      name: 'S',
      start: null,
      current: designOf(),
      environment,
      controller: { kind: 'hold' },
    });

    expect(() => withEvidence(bare, skill.evidence!, other)).toThrow(/different/);
  });
});

describe('storage and bundling', () => {
  const skill = trainedSkill(designOf());

  it('stores content-addressed under library/skills/<hash>', () => {
    const hash = skillHash(skill);

    expect(skillFolder(hash)).toBe(`library/skills/${hash}`);
    expect(skillHash(structuredClone(skill))).toBe(hash);
    expect(() => skillFolder('../../etc')).toThrow();
  });

  it('round-trips skills through a .basecase file and drops damaged ones', async () => {
    const damaged = { ...skill, binding: { ...skill.binding, physics: 'nope' } };
    const bytes = await encodeSceneFile({
      name: 'Quad',
      globalGoal: '',
      parts: quad.parts,
      annotations: [],
      skills: [skill, damaged as Skill],
    });
    const scene = await decodeSceneFile(bytes);

    expect(scene.skills).toEqual([skill]);
    expect(skillHash(scene.skills![0])).toBe(skillHash(skill));
  });

  it('opens a scene saved before skills existed', async () => {
    const scene = await decodeSceneFile(
      await encodeSceneFile({ name: 'Old', globalGoal: '', parts: [], annotations: [] }),
    );

    expect(scene.skills).toBeUndefined();
  });
});
