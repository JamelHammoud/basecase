import { electricalRobot } from './electricalRobots';
import { TorqueRecorder } from '../utils/peakTorque';
import { jointAmpModel } from '../utils/servoAmps';
import { retainMotorTrace } from '../utils/motorCurrentTrace';
import { actuatorOf } from '../data/components';
import { component, sceneOf, servoJoints } from './fixtures';
import { electricalProjection } from './electrical';
import { replayCables } from './powerReplayPreparation';

export function replayFixture(count = 1, adapters = 1, name = 'pan-tilt') {
  const robot = servoJoints({ prefix: 'motor', componentId: 'feetech-sts3215', variant: 'c001', count });
  const authored = sceneOf(
    [
      ...Array.from({ length: adapters }, (_, i) => component(`adapter${i}`, 'waveshare-bus-servo-adapter-a')),
      ...robot.parts,
    ],
    robot.joints,
    { tether: { volts: 6, amps: 100 } },
  );
  const layouts = {
    quadruped: 'quadruped',
    hexapod: 'hexapod',
    rover: 'battery-rover',
    'leg modules': 'quadruped',
  };
  const layout = Object.entries(layouts).find(([label]) => name.includes(label))?.[1] ?? name;
  const scene = electricalRobot(layout, authored);

  if (name.includes('mixed-bus'))
    scene.project.joints = scene.project.joints?.map((joint, index) => ({
      ...joint,
      limb: index < 3 ? 'arm' : undefined,
    }));

  if (name.includes('payload')) scene.parts[scene.parts.length - 1].massG = 750;

  const model = jointAmpModel([actuatorOf('feetech-sts3215', 'c001')], { volts: 6, stallNm: 1 });
  const recorder = new TorqueRecorder(count, 0.002, { amps: robot.joints.map(() => model) });

  for (let step = 0; step < 120; step++) {
    const forces = robot.joints.map((_, i) => (step < 36 || (step + i * 12) % 48 < 12 ? 0.8 : 0.1));

    recorder.add(forces, forces);
  }

  const trace = retainMotorTrace(recorder.series(), {
    joints: robot.joints,
    parts: scene.parts,
    models: Object.fromEntries(robot.joints.map((j) => [j.id, model])),
    identity: 'generated-motion',
  });
  const input = {
    ...scene,
    walk: { policy: 'generated-motion', seconds: 0.24, fellAt: null, joints: {}, motorTrace: trace },
  };
  const projection = electricalProjection(input);
  const cables = replayCables(projection);
  const declarations = {
    source: {
      volts: 6,
      ohms: 0.02,
      evidence: 'Generated 6 V resistive source control',
      temperatureC: 20,
      maximumA: 100,
      minimumV: 0,
    },
    junctionEvidence: 'Generated paired outgoing and return harness with ideal junctions',
    cables: cables.map((cable, i) => ({
      id: cable.id,
      outgoingOhms: 0.01 + i * 0.001,
      returnOhms: 0.015,
      temperatureC: 20,
      evidence: 'Generated total conductor resistance in ohms',
    })),
    fixedLoads: Object.fromEntries(
      scene.parts
        .filter((p) => p.id.startsWith('adapter'))
        .map((p) => [p.id, { amps: 0.1, evidence: 'Prescribed adapter control load' }]),
    ),
  };

  return { input, trace, declarations, cables };
}
