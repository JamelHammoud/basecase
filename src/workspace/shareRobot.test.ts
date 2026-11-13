import { describe, expect, it, vi } from 'vitest';
import { presetCase } from '../cases/caseBuilder';
import { GALLERY_BUNDLE_MAX_BYTES, galleryBundleBytes, readGalleryBundleBytes } from '../gallery/galleryBundle';
import { sharedRobotLink, sharedRobotPath } from '../gallery/galleryLinks';
import { fixtureTriangles } from '../sim/fixtures/parts';
import { POLICY_FORMAT, POLICY_VERSION, policyObsSize, type PolicySpec } from '../sim/policy';
import { SKILL_FORMAT, SKILL_VERSION, skillHash, type Skill } from '../skills/artifacts';
import type { SkillRecord } from '../skills/skillRecords';
import type { SkillRow } from '../skills/skillRows';
import { fixtureModel, fixtureRobot } from '../skills/fixtureModels';
import { DEFAULT_PROJECT, type PolicyRecord, type ScenePart } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { hubBridge } from '../hub/hubBridge';
import { publishSharedRobot, sharedRobotBundle, type ShareSource } from './shareRobot';

vi.mock('../hub/hubBridge', () => ({
  hubBridge: { publish: vi.fn(async ({ name }: { name: string }) => ({ repo: `tester/${name}`, url: '' })) },
}));

const rover = fixtureRobot('rover-diff');
const kase = presetCase('reach-the-flag', buildRig(rover.joints, rover.parts), rover.parts);
const sourcedMotor = (p: ScenePart): ScenePart =>
  p.id === 'left_wheel_disc' ? { ...p, kind: 'component', componentId: 'sourced-gear-motor-1a2b' } : p;
const table: ScenePart = { ...rover.parts[0], id: 'table', name: 'Table', position: [900, 0, 900] };
const hash = 'a'.repeat(64);

const policySpec = (): PolicySpec => {
  const spec: PolicySpec = {
    format: POLICY_FORMAT,
    version: POLICY_VERSION,
    task: 'stand',
    robot: 'Robot',
    joints: ['left', 'right'],
    defaultPose: [0, 0],
    actionScale: 0.25,
    controlDt: 0.02,
    command: [0, 0, 0],
    obsMean: [],
    obsStd: [],
    layers: [{ in: 1, out: 2, w: [0.5, 3], b: [0, 0] }],
    activation: 'elu',
    trainedSteps: 1000,
    mujoco: '4.0.0',
    createdAt: '',
  };

  return { ...spec, obsMean: new Array(policyObsSize(spec)).fill(0), obsStd: new Array(policyObsSize(spec)).fill(1) };
};

const policy = (id: string, createdAt: string, fellAt: number | null): PolicyRecord => ({
  id,
  name: id,
  task: 'stand',
  robot: 'rover',
  robotName: 'Rover',
  command: [0, 0, 0],
  trainedSteps: 1000,
  createdAt,
  eval: { fellAt, seconds: 10, forward: 0, travelled: 0 },
});

const skill: Skill = {
  format: SKILL_FORMAT,
  version: SKILL_VERSION,
  name: 'Settle',
  binding: {
    design: 'd',
    contract: hash,
    physics: hash,
    actuators: hash,
    topology: hash,
    observation: hash,
    action: hash,
  },
  observation: [],
  action: { kind: 'position-offset', joints: ['left'], scale: 0.25, controlDt: 0.02 },
  controller: { kind: 'hold' },
  evidence: null,
  warmStartFrom: null,
};

const skillRow = (createdAt: string): SkillRow => {
  const record: SkillRecord = {
    hash: skillHash(skill),
    name: 'Settle',
    kit: 'settle-to-neutral',
    goal: null,
    binding: skill.binding,
    evidence: null,
    origin: null,
    environment: null,
    createdAt,
  };

  return {
    target: 'kit:settle-to-neutral',
    label: 'Settle',
    kit: record.kit,
    record,
    state: { kind: 'ready', arena: '' },
    drives: false,
    move: null,
  };
};

function scene(over: Partial<ShareSource> = {}): ShareSource {
  const parts = [...rover.parts.map(sourcedMotor), table];

  return {
    sceneId: 'scene-1',
    sceneName: 'Rover on the Desk',
    parts,
    project: { ...DEFAULT_PROJECT, joints: rover.joints, cases: [kase] },
    kase,
    model: () => Promise.resolve(fixtureModel('rover-diff')),
    triangles: fixtureTriangles(parts),
    meshesReady: () => Promise.resolve(),
    policies: { load: () => Promise.resolve(policySpec()), isStale: () => false },
    skillRows: [],
    loadSkill: () => Promise.resolve(skill),
    ...over,
  };
}

describe('Share Robot', () => {
  it('builds a bundle from the open scene that parses and stays under the 8 MB budget', async () => {
    const bundle = await sharedRobotBundle(scene());
    const bytes = galleryBundleBytes(bundle);
    const read = readGalleryBundleBytes(bytes);
    const motor = read.robot.parts.find((p) => p.id === 'left_wheel_disc')!;

    expect(bytes.byteLength).toBeLessThan(GALLERY_BUNDLE_MAX_BYTES);
    expect(read.robot.parts.map((p) => p.id).sort()).toEqual(rover.parts.map((p) => p.id).sort());
    expect(read.case).toEqual(kase);
    expect(motor.kind).toBe('mesh');
    expect(motor.componentId).toBeUndefined();
    expect(motor.mesh!.positions).toHaveLength(8 * 3);
    expect(motor.mesh!.indices).toHaveLength(12 * 3);
    expect(read.robot.parts.find((p) => p.id === 'chassis')).toEqual(rover.parts[0]);
    expect(sharedRobotPath(new URL(sharedRobotLink(`tester/${read.slug}`)).pathname)).toEqual({
      account: 'tester',
      repo: read.slug,
    });
  });

  it('refuses a scene with no Case open', async () => {
    await expect(sharedRobotBundle(scene({ kase: null }))).rejects.toThrow('Open a Case first.');
  });

  it('carries the newest policy or skill that passed, and nothing that fell or is out of date', async () => {
    const project = {
      ...scene().project,
      policies: [
        policy('stood', '2026-11-01', null),
        policy('fell', '2026-11-03', 2.5),
        policy('old', '2026-11-04', null),
      ],
    };
    const isStale = (r: PolicyRecord) => r.id === 'old';
    const withPolicy = await sharedRobotBundle(
      scene({ project, policies: { load: () => Promise.resolve(policySpec()), isStale } }),
    );

    expect(withPolicy.trained?.kind).toBe('policy');
    expect(withPolicy.trained?.kind === 'policy' && withPolicy.trained.record.id).toBe('stood');

    const withSkill = await sharedRobotBundle(
      scene({
        project,
        policies: { load: () => Promise.resolve(policySpec()), isStale },
        skillRows: [skillRow('2026-11-02')],
      }),
    );

    expect(readGalleryBundleBytes(galleryBundleBytes(withSkill)).trained?.kind).toBe('skill');
    expect((await sharedRobotBundle(scene())).trained).toBeUndefined();
  });

  it('publishes the bundle beside a card that tags the repo basecase-case', async () => {
    const bundle = await sharedRobotBundle(scene());

    expect(await publishSharedRobot(bundle)).toBe(`https://app.basecase.so/r/tester/${bundle.slug}`);

    const { files } = vi.mocked(hubBridge.publish).mock.calls[0][0];

    expect(Object.keys(files)).toEqual(['basecase-robot.json', 'README.md']);
    expect(new TextDecoder().decode(files['README.md'])).toBe('---\ntags:\n- basecase-case\n---\n');
  });
});
