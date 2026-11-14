import { box, joint } from '../../../sim/fixtures/parts';
import { DEFAULT_PROJECT, type ProjectSettings, type RobotJoint, type ScenePart } from '../../../types/robotics';

export const PAN_JOINT = 'pan';
export const TILT_JOINT = 'tilt';
export const PAN_TILT_CAMERA = 'cam';

const camera: ScenePart = {
  id: PAN_TILT_CAMERA,
  name: 'Head Camera',
  kind: 'component',
  category: 'perception',
  role: 'solid',
  componentId: 'raspberry-pi-camera-3',
  position: [0, 110, 22],
  rotation: [-90, 0, 0],
  dimensions: { width: 25, height: 12, depth: 24 },
  color: '#333333',
  note: '',
  visible: true,
  locked: false,
  massG: 4,
};

export interface PanTiltScene {
  name: string;
  parts: ScenePart[];
  project: ProjectSettings;
}

export function panTiltJoints(): RobotJoint[] {
  return [
    joint({
      id: PAN_JOINT,
      link: ['base', 'turret'],
      origin: [0, 50, 0],
      axis: [0, 1, 0],
      effortNm: 1.5,
      range: [-90, 90],
    }),
    joint({
      id: TILT_JOINT,
      link: ['turret', 'head'],
      origin: [0, 95, 0],
      axis: [1, 0, 0],
      effortNm: 1.5,
      range: [-45, 45],
      parentJoint: PAN_JOINT,
    }),
  ].map((j) => (j.id === TILT_JOINT ? { ...j, child: [...j.child, PAN_TILT_CAMERA] } : j));
}

export function panTilt(): PanTiltScene {
  const parts = [
    box('base', [0, 25, 0], [80, 50, 80], 400),
    box('turret', [0, 70, 0], [50, 40, 50], 80),
    box('head', [0, 110, 0], [40, 30, 30], 40),
    camera,
  ];

  return { name: 'pan-tilt', parts, project: { ...DEFAULT_PROJECT, joints: panTiltJoints() } };
}
