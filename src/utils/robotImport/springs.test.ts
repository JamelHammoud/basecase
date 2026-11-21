import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { expect, it, vi } from 'vitest';
import { parseMjcf } from './mjcf';
import { parseUrdf } from './urdf';
import { parseXml } from './robotImport.fixtures';
import { passiveJointXml } from '../../sim/mjcfPassive';
import { binaryStl } from '../stlBytes';
import { writeUrdf } from './urdfWriter';
import { buildMjcf } from '../../sim/mjcf';
import { buildRig } from '../kinematics';
import { passiveMechanism, passiveMechanisms } from '../../sim/fixtures/passiveMechanisms';
import { TinyDomParser, localFile } from './robotImport.fixtures';
import { importRobot } from './importRobot';
import { captureCaseFixture, placeCaseFixture } from '../../cases/fixtureAssembly';
import { preparedWorldItems } from '../../cases/fixtureCollision';
import { emitWorld } from '../../sim/mjcfWorld';
import { worldItem } from '../../cases/schema';
import { DEFAULT_PROJECT, type ScenePart } from '../../types/robotics';
import type { RobotJoint } from '../../types/robotics';

async function springMotion(mj: MainModule, parts: ScenePart[], joints: RobotJoint[]) {
  const saved = await captureCaseFixture({ parts, joints, name: 'Spring assembly' });
  const world = await preparedWorldItems(placeCaseFixture(saved, { position: [0, 0, 0] }).map(worldItem));
  const emitted = emitWorld(
    { parts: [], rig: buildRig([], []), project: DEFAULT_PROJECT, measures: {}, partTriangles: () => null, world },
    0,
  );
  const model = mj.MjModel.from_xml_string(
    `<mujoco><compiler angle="radian"/><option timestep="0.002" gravity="0 0 0"/><asset>${emitted.assets.join('')}</asset><worldbody>${emitted.lines.join('')}</worldbody></mujoco>`,
  );
  const data = new mj.MjData(model);
  const samples: number[] = [];

  try {
    expect(model.nu).toBe(0);

    for (let step = 0; step < 1000; step++) {
      mj.mj_step(model, data);

      if (step % 100 === 0) samples.push(...data.qpos);
    }

    return samples;
  } finally {
    data.delete();
    model.delete();
  }
}

it('retains declared hinge and slider springs with MJCF angle units and URDF SI extensions', () => {
  const model = parseMjcf(
    parseXml(`<mujoco><compiler angle="degree"/><worldbody><body name="base">
    <body name="lid"><joint name="hinge" range="0 90" stiffness="3" springref="15"/></body>
    <body name="button"><joint name="slide" type="slide" range="0 0.02" stiffness="200" springref="0.005"/></body>
    </body></worldbody></mujoco>`),
  );
  const hinge = model.joints.find((joint) => joint.name === 'hinge')!;
  const slide = model.joints.find((joint) => joint.name === 'slide')!;

  expect(hinge.stiffness).toBe(3);
  expect(hinge.damping).toBeUndefined();
  expect(hinge.frictionloss).toBeUndefined();
  expect(hinge.springref).toBeCloseTo(Math.PI / 12, 12);
  expect(slide.stiffness).toBe(200);
  expect(slide.springref).toBeCloseTo(0.005, 12);

  const urdf = parseUrdf(
    parseXml(`<robot name="spring"><link name="base"/><link name="button"/>
    <joint name="slide" type="prismatic"><parent link="base"/><child link="button"/><axis xyz="1 0 0"/>
    <limit lower="0" upper="0.02"/><basecase actuation="passive" stiffness="200" springref="0.005"/></joint></robot>`),
  );

  expect(urdf.joints.find((joint) => joint.name === 'slide')).toMatchObject({ stiffness: 200, springref: 0.005 });
});

it.each(['revolute', 'prismatic'] as const)('emits a passive %s spring without creating an actuator', (type) => {
  const joint: RobotJoint = {
    id: 'spring',
    name: 'Spring',
    type,
    parent: ['base'],
    child: ['tip'],
    axis: [1, 0, 0],
    origin: [0, 0, 0],
    range: [0, 30],
    actuation: 'passive',
    stiffness: 3,
    springref: 15,
  };
  const state = { simJoints: [], initialValues: {} };
  const xml = passiveJointXml({ st: state, robot: { key: 'robot' }, local: { values: {} } }, joint, 'spring');
  const restored = parseMjcf(
    parseXml(
      `<mujoco><compiler angle="radian"/><worldbody><body name="base"><body name="tip">${xml}</body></body></worldbody></mujoco>`,
    ),
  );

  expect(restored.joints.find((item) => item.name === 'spring')).toMatchObject({ actuation: 'passive', stiffness: 3 });
  expect(restored.joints.find((item) => item.name === 'spring')!.springref).toBeCloseTo(
    type === 'revolute' ? Math.PI / 12 : 0.015,
    12,
  );
  expect(state.simJoints).toMatchObject([{ actuator: -1 }]);
});

it('round-trips an imported passive spring through URDF export, Library and Case placement', async () => {
  vi.stubGlobal('DOMParser', TinyDomParser);

  try {
    const fixture = passiveMechanism(passiveMechanisms[8]);

    fixture.parts[0] = { ...fixture.parts[0], position: [0, 470, 0] };

    const joints = fixture.project.joints.map((joint) => ({
      ...joint,
      actuation: 'passive' as const,
      damping: 0.1,
      stiffness: 0.3,
      springref: 5,
    }));
    const model = buildMjcf({
      ...fixture,
      project: { ...fixture.project, joints },
      rig: buildRig(joints, fixture.parts),
      measures: {},
      partTriangles: () => null,
    });
    const { urdf, meshes } = writeUrdf({
      name: 'Spring assembly',
      model,
      joints,
      parts: fixture.parts,
      masses: fixture.parts.map((part) => ({
        id: part.id,
        grams: part.massG!,
        centroid: part.position,
        source: 'published' as const,
      })),
      triangles: () => null,
    });
    const source = await importRobot({
      kind: 'files',
      files: [
        localFile('spring.urdf', urdf),
        ...Object.entries(meshes).map(([path, triangles]) => localFile(path, binaryStl(triangles))),
      ],
    });
    const saved = await captureCaseFixture({ ...source, name: 'Spring assembly' });
    const placed = placeCaseFixture(saved, { position: [0, 0, 0] });

    expect(
      source.joints.filter((joint) => joint.type !== 'fixed').every((joint) => joint.actuation === 'passive'),
    ).toBe(true);
    expect(
      placed.filter((object) => object.joint).every((object) => Math.abs(object.joint!.stiffness! - 0.3) < 1e-10),
    ).toBe(true);
    expect(placed.find((object) => object.joint)?.joint?.springref).toBeCloseTo(5, 3);

    const mj = await loadMujoco();
    const expected = await springMotion(mj, fixture.parts, joints);
    const motion = await springMotion(mj, source.parts, source.joints);

    expect(motion).toHaveLength(expected.length);
    motion.forEach((value, i) => expect(value).toBeCloseTo(expected[i], 4));
  } finally {
    vi.unstubAllGlobals();
  }
});
