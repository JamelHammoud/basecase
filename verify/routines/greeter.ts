import { box, joint } from '../../src/sim/fixtures/parts';
import { fixtureRobots } from '../../src/sim/fixtures/robots';
import type { RobotJoint, ScenePart } from '../../src/types/robotics';
import type { PhysicsRobot } from './interfaces';

const BODY_TOP = 180;
const CAMERA = 'raspberry-pi-camera-3';
const SPEAKER = 'adafruit-speaker-40mm';

const component = (part: ScenePart, componentId: string): ScenePart => ({ ...part, kind: 'component', componentId });

const quad = () => {
  const robot = fixtureRobots().find((r) => r.id === 'quad-servo');

  if (!robot) throw new Error('The quad-servo fixture robot is gone.');

  return robot;
};

const headPan: RobotJoint = joint({
  id: 'head_pan',
  link: ['body', 'head'],
  origin: [0, BODY_TOP, 70],
  axis: [0, 1, 0],
  effortNm: 1.9,
  range: [-90, 90],
  limb: 'neck',
});

const headParts = (): ScenePart[] => [box('head', [0, BODY_TOP + 25, 70], [60, 50, 60], 120)];

const cameraOn = (y: number, z: number) => component(box('camera', [0, y, z], [25, 24, 12], 4), CAMERA);

const speaker = () => component(box('speaker', [0, BODY_TOP + 5, -50], [40, 10, 40], 20), SPEAKER);

export function greeter(): PhysicsRobot {
  const base = quad();
  const camera = cameraOn(BODY_TOP + 30, 106);

  return {
    id: 'greeter-quad',
    parts: [...base.parts, ...headParts(), camera, speaker()],
    joints: [...base.joints, { ...headPan, child: ['head', 'camera'] }],
  };
}

export function greeterWithoutCamera(): PhysicsRobot {
  const base = quad();

  return {
    id: 'greeter-quad-no-camera',
    parts: [...base.parts, ...headParts(), speaker()],
    joints: [...base.joints, headPan],
  };
}

export function greeterWithoutHead(): PhysicsRobot {
  const base = quad();

  return {
    id: 'greeter-quad-no-head',
    parts: [...base.parts, cameraOn(BODY_TOP + 12, 106), speaker()],
    joints: base.joints,
  };
}

export const CAMERA_COMPONENT = CAMERA;
