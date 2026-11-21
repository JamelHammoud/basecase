import { comparisonHash } from './comparison';
import type { MainModule } from '@mujoco/mujoco';
import { buildMjcf } from '../../sim/mjcf';
import { SimEngine } from '../../sim/engine';
import { Recorder } from '../../sim/recorder';
import { fixtureRobots } from '../../sim/fixtures/robots';
import { box, fixtureMeasures, fixtureTriangles } from '../../sim/fixtures/parts';
import { buildRig } from '../../utils/kinematics';
import { DEFAULT_PROJECT } from '../../types/robotics';
import { BAM_STS3215_7V4 } from '../../data/servoFits';
import { TopicCollector } from '../../topics/collector';
import { encodeTopicLog } from '../../topics/topicFile';
import { encodeRecording } from '../recordingFile';
import { comparisonFixture } from './comparisonFixtures';
import { sha256 } from '../tries';
import { writeMcap, type FixtureMessage } from '../../datasets/import/mcapFixtures';
import { readMcap } from '../../datasets/import/recordingFiles';
import { topicOnlyTries } from '../../datasets/import/topicOnlyTries';
import type { StoredTry } from '../tryFile';
import { readOperateLog } from '../../robot/operateLog';
import { operateEpisode } from '../../robot/operateTry';

export interface MatrixCase {
  scenario: string;
  robot: string | null;
  a: number[];
  b: number[];
  at: number[];
  bt: number[];
  expected: [number, number];
  kind?: 'calibration' | 'emulated' | 'camera' | 'mcap' | 'rates' | 'payload' | 'states' | 'topics';
}

export const comparisonMatrix: MatrixCase[] = [
  {
    scenario: 'rover controller edit',
    robot: 'rover-diff',
    a: [0.1, 0.2, 0.3],
    b: [0.2, 0.4, 0.6],
    at: [0, 1, 2],
    bt: [0, 1, 2],
    expected: [0.2, 0.4],
  },
  {
    scenario: 'arm calibration',
    robot: 'arm-3dof',
    kind: 'calibration',
    a: [0, 0.2, 0.4],
    b: [0.1, 0.4, 0.7],
    at: [0, 1, 2],
    bt: [0, 1, 2],
    expected: [0.2, 0.4],
  },
  {
    scenario: 'quadruped sim and emulated Operate',
    robot: 'quad-servo',
    kind: 'emulated',
    a: [0.1, 0.3, 0.5],
    b: [0.2, 0.5, 0.8],
    at: [0, 1, 2],
    bt: [0, 1, 2],
    expected: [0.3, 0.5],
  },
  {
    scenario: 'two camera configurations',
    robot: 'rover-diff',
    kind: 'camera',
    a: [0, 0.1, 0.2],
    b: [0, 0.2, 0.4],
    at: [0, 1, 2],
    bt: [0, 1, 2],
    expected: [0.1, 0.2],
  },
  {
    scenario: 'two MCAPs with identical topics',
    robot: null,
    kind: 'mcap',
    a: [11, 22, 33],
    b: [101, 202, 303],
    at: [0, 1, 2],
    bt: [0, 1, 2],
    expected: [22, 202],
  },
  {
    scenario: 'ROS recordings at unequal sample rates',
    robot: null,
    kind: 'rates',
    a: [1, 3, 5],
    b: [2, 4, 6, 8, 10],
    at: [0, 1, 2],
    bt: [0, 0.5, 1, 1.5, 2],
    expected: [3, 6],
  },
  {
    scenario: 'gripper payload change',
    robot: 'arm-6dof',
    kind: 'payload',
    a: [0.05, 0.1, 0.15],
    b: [0.1, 0.2, 0.3],
    at: [0, 1, 2],
    bt: [0, 1, 2],
    expected: [0.1, 0.2],
  },
  {
    scenario: 'mobile clock offsets and missing intervals',
    robot: 'rover-four',
    a: [0.1, 0.4, 0.9],
    b: [0.2, 0.6, 1],
    at: [100, 101, 110],
    bt: [200, 201, 202],
    expected: [0.4, 0.6],
  },
  {
    scenario: 'fixed appliance discrete states',
    robot: 'appliance',
    kind: 'states',
    a: [0, 3, 6, 9],
    b: [0, 4, 8],
    at: [0, 1, 1, 2],
    bt: [0, 1, 2],
    expected: [6, 4],
  },
  {
    scenario: 'topic-only recordings without matched joints',
    robot: null,
    kind: 'topics',
    a: [13, 14, 15],
    b: [23, 24, 25],
    at: [0, 1, 2],
    bt: [0, 1, 2],
    expected: [14, 24],
  },
];

function sourceTopics(spec: MatrixCase, phase: number) {
  const collector = new TopicCollector();
  const times = phase === 0 ? spec.at : spec.bt;
  const values = phase === 0 ? spec.a : spec.b;

  times.forEach((time, i) => {
    const stamp = BigInt(Math.round(time * 1e9));

    collector.add('/imu', 'sensor_msgs/Imu', stamp, { angular_velocity: { x: values[i], y: 0, z: 0 } });
    collector.add('/mode', 'std_msgs/String', stamp, { data: ['idle', 'trigger', 'run', 'done'][i] });
    collector.add('/scan', 'sensor_msgs/LaserScan', stamp, {
      header: { frame_id: 'laser' },
      angle_min: 0,
      angle_increment: 1,
      range_min: 0.1,
      range_max: 10,
      ranges: [1 + phase + i],
    });

    if (spec.kind !== 'camera') return;

    const width = phase === 0 ? 4 : 2;
    const rgb = phase === 0 ? [255, 0, 0] : [0, 255, 0];

    collector.add('/camera', 'sensor_msgs/Image', stamp, {
      header: { frame_id: phase === 0 ? 'front' : 'side' },
      width,
      height: 1,
      encoding: 'rgb8',
      step: width * 3,
      data: Uint8Array.from(Array.from({ length: width }, () => rgb).flat()),
    });
  });

  return encodeTopicLog(collector.finish(0n));
}

function fixtureRobot(id: string) {
  if (id === 'appliance') return { id, parts: [box('appliance', [0, 50, 0], [100, 100, 100], 500)], joints: [] };

  const robots = fixtureRobots();
  const robot =
    robots.find((candidate) => candidate.id === id) ??
    robots.find((candidate) => id.includes('gripper') && candidate.joints.some((joint) => joint.id.includes('grip')));

  if (!robot) throw new Error(`Missing fixture robot ${id}`);

  return robot;
}

function modelRobot(spec: MatrixCase) {
  const robot = fixtureRobot(spec.robot!);

  if (spec.kind !== 'calibration') return robot;

  const servos = robot.joints.map((joint, i) => ({
    ...box(`servo-${i}`, joint.origin, [45, 25, 35], 55),
    kind: 'component' as const,
    componentId: 'feetech-sts3215',
    componentVariant: 'c001',
  }));

  return {
    ...robot,
    parts: [...robot.parts, ...servos],
    joints: robot.joints.map((joint, i) => ({
      ...joint,
      parent: [...joint.parent, servos[i].id],
      actuators: [servos[i].id],
    })),
  };
}

async function importedMatrixSource(spec: MatrixCase, phase: number) {
  const times = phase === 0 ? spec.at : spec.bt;
  const values = phase === 0 ? spec.a : spec.b;
  const messages: FixtureMessage[] = times.flatMap((time, i) =>
    [
      { topic: '/imu', schema: 'sensor_msgs/Imu', payload: { angular_velocity: { x: values[i], y: 0, z: 0 } } },
      { topic: '/mode', schema: 'std_msgs/String', payload: { data: ['idle', 'trigger', 'run', 'done', 'done'][i] } },
    ].map(({ topic, schema, payload }) => ({
      topic,
      schema,
      encoding: 'json',
      schemaEncoding: 'jsonschema',
      schemaData: new TextEncoder().encode('{}'),
      logTime: BigInt(Math.round((1_700_000_000 + time) * 1e9)),
      data: new TextEncoder().encode(JSON.stringify(payload)),
    })),
  );
  const file = await writeMcap(messages);
  const name = `source-${phase}.mcap`;
  const data = await readMcap([{ name, bytes: file }]);
  const built = await topicOnlyTries(data, {
    sceneId: 'matrix',
    modelHash: '',
    startedAt: '2026-11-17T00:00:00Z',
    origin: { kind: 'file', name, hash: await comparisonHash(file) },
  });
  const saved = built.kept[0];

  return { stored: saved.stored, bytes: encodeRecording(saved.recording) };
}

export async function matrixSource(mj: MainModule, spec: MatrixCase, phase: number) {
  if (!spec.robot) return importedMatrixSource(spec, phase);

  const robot = modelRobot(spec);
  const parts = robot.parts.map((part, i) =>
    spec.kind === 'payload' && i === robot.parts.length - 1 ? { ...part, massG: phase === 0 ? 100 : 250 } : part,
  );
  const servoFits =
    spec.kind === 'calibration'
      ? Object.fromEntries(
          robot.joints.map((joint) => [
            joint.id,
            { fit: { ...BAM_STS3215_7V4, delayS: phase === 0 ? 0.02 : 0.04 }, volts: 7.4 },
          ]),
        )
      : undefined;
  const model = buildMjcf({
    parts,
    rig: buildRig(robot.joints, parts),
    project: { ...DEFAULT_PROJECT, joints: robot.joints },
    measures: fixtureMeasures(parts),
    partTriangles: fixtureTriangles(parts),
    servoFits,
  });
  const engine = new SimEngine(mj, model);
  const values = phase === 0 ? spec.a : spec.b;
  const times = phase === 0 ? spec.at : spec.bt;
  const qpos = Float64Array.from(engine.data.qpos);
  const addresses = engine.jointAddresses();
  const pose = (value: number) => {
    addresses.forEach((address, i) => {
      if (address < 0) return;

      qpos[address] = model.joints[i].type === 'prismatic' ? Math.min(value, 0.003) : value;
    });

    engine.setState(qpos);
  };

  const operated =
    spec.kind === 'emulated' && phase === 1
      ? operateEpisode(
          readOperateLog(
            times
              .map((time, i) =>
                JSON.stringify({
                  k: 'status',
                  t: time,
                  mode: 'policy',
                  run: 'emulated-quadruped',
                  q: model.joints.map(() => values[i]),
                }),
              )
              .join('\n'),
          ),
          model.joints.length,
        )
      : null;
  const positions = operated ? times.map((_, i) => operated.state[i * model.joints.length]) : values;

  try {
    pose(positions[0]);

    const controller = {
      kind: 'hold' as const,
      values: Object.fromEntries(model.joints.map((joint) => [joint.id, phase === 0 ? 10 : 20])),
    };
    const recorder = new Recorder(engine, controller);

    for (let i = 1; i < times.length; i++) {
      engine.data.time = i;
      pose(positions[i]);
      recorder.hook();
    }

    const recording = recorder.finish();

    recording.t = Float32Array.from(times);
    recording.topics = sourceTopics(spec, phase);
    recording.inputs = [{ at: times[0] + 1, name: 'trigger', value: true }];

    const stored: StoredTry = {
      ...comparisonFixture({ id: `matrix-${phase}`, times, values }).stored,
      id: `matrix-${phase}`,
      robot: { name: robot.id, modelHash: await sha256(model.xml), joints: model.joints.map((joint) => joint.id) },
      source: spec.kind === 'emulated' && phase === 1 ? 'operate' : 'case',
      policy: phase === 0 ? 'controller-before' : 'controller-after',
      frames: recording.frames,
    };

    delete stored.origin;

    return { stored, bytes: encodeRecording(recording) };
  } finally {
    engine.dispose();
  }
}
