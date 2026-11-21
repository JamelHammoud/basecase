import type { MainModule } from '@mujoco/mujoco';
import { box, joint } from '../sim/fixtures/parts';
import { fixturePackageJob } from '../sim/fixtures/robotPackage';
import { roundWheelRover } from '../sim/fixtures/robots';
import { buildMjcf } from '../sim/mjcf';
import { buildRig } from '../utils/kinematics';
import { SimEngine } from '../sim/engine';
import type { SimModel } from '../sim/mjcfTypes';
import type { RobotRun } from '../robot/runBuffer';
import { sha256 } from '../cases/tries';
import type { BodyAnalysisRequest, BodyDistinguishability } from './bodyAnalysisTypes';
import type { BodyFit } from './bodyTypes';

export const BODY_ANALYSIS_SCENARIOS = [
  'single-link arm',
  'two-link masses',
  'terminal payload',
  'coupled wrist',
  'horizontal arm',
  'informative rover',
  'stationary rover',
  'asymmetric quadruped',
  'unexcited pan-tilt',
  'unchanged control',
] as const;

type Scenario = (typeof BODY_ANALYSIS_SCENARIOS)[number];

interface Expected {
  kind: keyof BodyFit;
  body: string;
  status: BodyDistinguishability;
}

export function analysisArmScene(coupled = false) {
  const parts = [
    box('base', [0, 25, 0], [80, 50, 80], 400),
    box('forearm', [0, 125, 0], [40, 150, 50], coupled ? 1500 : 800),
    box('wrist', [0, 265, 0], coupled ? [1, 1, 1] : [50, 130, 40], coupled ? 200 : 500),
  ];
  const joints = [
    joint({
      id: 'shoulder',
      link: ['base', 'forearm'],
      origin: [0, 50, 0],
      axis: [1, 0, 0],
      effortNm: coupled ? 3 : 0.7,
    }),
    joint({
      id: 'wrist',
      link: ['forearm', 'wrist'],
      origin: [0, 200, 0],
      axis: [1, 0, 0],
      effortNm: coupled ? 0.4 : 0.25,
      parentJoint: 'shoulder',
    }),
  ];

  return { id: 'analysis-arm', name: 'Analysis arm', parts, project: { joints }, joints };
}

function armModel(name: Scenario): SimModel {
  const scene = analysisArmScene(name === 'coupled wrist');
  const single = name === 'single-link arm' || name === 'horizontal arm';
  const parts = single ? scene.parts.slice(0, 2) : scene.parts;
  const joints = single ? scene.joints.slice(0, 1) : scene.joints;
  const mapped = joints.map((entry, index) => ({
    ...entry,
    axis:
      name === 'horizontal arm' || (name === 'unexcited pan-tilt' && index === 0)
        ? ([0, 1, 0] as [number, number, number])
        : entry.axis,
  }));

  return fixturePackageJob({ id: name.replaceAll(' ', '-'), parts, joints: mapped }).job.model;
}

function quadModel(): SimModel {
  const feet: Array<[number, number, number]> = [
    [-75, 55, -65],
    [75, 55, -65],
    [-70, 55, 75],
    [80, 55, 75],
  ];
  const parts = [
    box('body', [0, 135, 0], [160, 50, 190], 850),
    ...feet.map((at, index) => box(`leg${index}`, at, [20, 110, 20], 90 + 15 * index)),
  ];
  const joints = feet.map((at, index) =>
    joint({
      id: `leg${index}`,
      link: ['body', `leg${index}`],
      origin: [at[0], 110, at[2]],
      axis: [1, -0.3, 0],
      effortNm: 6,
      type: 'prismatic',
      range: [-50, 50],
      limb: 'leg',
    }),
  );

  return fixturePackageJob({ id: 'asymmetric-quad', parts, joints }).job.model;
}

function goals(name: Scenario, t: number, index: number): number {
  if (name === 'stationary rover' || (name === 'unexcited pan-tilt' && index === 0)) return 0;

  if (name === 'horizontal arm') return 0.1 * Math.sin(t * 0.3);

  if (name === 'informative rover') return (index === 1 ? -1 : 1) * 2 * Math.sin(t * 14.1 + index * 0.4);

  if (name === 'asymmetric quadruped') return 0.035 * Math.sin(t * (3.1 + index * 0.5) + index * 1.7);

  return 0.65 * Math.sin(t * (2.3 + index * 0.9)) + 0.18 * Math.sin(t * 7.3 + index);
}

function recording(mj: MainModule, model: SimModel, name: Scenario) {
  const engine = new SimEngine(mj, model);
  const run: RobotRun = {
    joints: model.joints.map((entry) => entry.id),
    statuses: [],
    intents: [],
    faultJoint: null,
    faultAt: 0,
    message: '',
  };
  let previous = '';
  let contactTransitions = 0;

  try {
    for (let frame = 0; frame <= 60; frame++) {
      const t = frame * 0.03;
      const command = model.joints.map((_, index) => goals(name, t, index));
      const contacts = engine.data.ncon.toString();

      if (frame > 0 && contacts !== previous) contactTransitions++;

      previous = contacts;
      run.statuses.push({ at: t * 1000, positions: Array.from(engine.jointAngles()) });
      run.intents.push({ at: t * 1000, joints: command });
      engine.setController({
        kind: 'hold',
        values: Object.fromEntries(
          model.joints.map((entry, index) => [
            entry.id,
            command[index] * (entry.type === 'revolute' ? 180 / Math.PI : 1000),
          ]),
        ),
      });
      engine.step(0.03);
    }

    return { run, contactTransitions };
  } finally {
    engine.dispose();
  }
}

function expectedFor(model: SimModel, name: Scenario): Expected[] {
  const own = model.bodies.filter((body) => body.joint);
  const mass = (index: number, status: BodyDistinguishability): Expected => ({
    kind: 'massScales',
    body: own[index].name,
    status,
  });
  const payload = (status: BodyDistinguishability): Expected => ({ kind: 'payloadKg', body: own.at(-1)!.name, status });
  const friction = (status: BodyDistinguishability): Expected => ({ kind: 'floorFrictionScale', body: '', status });

  if (name === 'coupled wrist') return [mass(1, 'coupled'), payload('coupled'), mass(0, 'distinguishable')];

  if (name === 'horizontal arm') return [mass(0, 'poor-excitation')];

  if (name === 'stationary rover') return [friction('poor-excitation')];

  if (name === 'informative rover' || name === 'asymmetric quadruped') return [friction('distinguishable')];

  if (name === 'unexcited pan-tilt') return [mass(0, 'poor-excitation')];

  if (name === 'terminal payload') return [payload('distinguishable')];

  if (name === 'two-link masses') return [mass(0, 'distinguishable'), mass(1, 'distinguishable')];

  return [mass(0, 'distinguishable')];
}

export async function bodyAnalysisScenario(mj: MainModule, name: Scenario) {
  let model = armModel(name);

  if (name.includes('rover')) model = roverModel();

  if (name === 'asymmetric quadruped') model = quadModel();

  const { run, contactTransitions } = recording(mj, model, name);
  const request: BodyAnalysisRequest = {
    model,
    run,
    robot: model.robots[0].key,
    units: model.joints.map((entry) => (entry.type === 'revolute' ? 'rad' : 'm')),
    source: {
      recording: name.replaceAll(' ', '-'),
      unit: 'generated',
      scene: 'generated',
      modelHash: await sha256(model.xml),
      modelFingerprint: model.robots[0].fingerprint,
      calibrationFingerprint: 'preset',
    },
  };

  return {
    request,
    expected: expectedFor(model, name),
    contactTransitions: name === 'asymmetric quadruped' ? contactTransitions : undefined,
  };
}

function roverModel(): SimModel {
  const rover = roundWheelRover();
  const joints = rover.joints.map((entry) => ({ ...entry, range: [-180, 180] as [number, number] }));
  const fixture = fixturePackageJob({ ...rover, joints });
  const model = buildMjcf({
    parts: rover.parts,
    rig: buildRig(joints, rover.parts),
    project: fixture.project,
    measures: fixture.measures,
    partTriangles: (id) => fixture.job.triangles[id] ?? null,
    fixedBase: { [fixture.job.model.robots[0].key]: false },
  });

  return { ...model, xml: model.xml.replace('friction="0.9 0.02 0.002"', 'friction="0.15 0.02 0.002"') };
}
