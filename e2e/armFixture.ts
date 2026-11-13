import { DEFAULT_PROJECT, type RobotJoint, type ScenePart } from '../src/types/robotics';

const block = (id: string, y: number, extra: Partial<ScenePart> = {}): ScenePart => ({
  id,
  name: id,
  kind: 'box',
  category: 'structure',
  role: 'solid',
  position: [0, y, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 40, height: 40, depth: 40 },
  color: '#888888',
  note: '',
  visible: true,
  locked: false,
  massG: 60,
  ...extra,
});

const servo = (id: string, y: number, componentId = 'feetech-sts3215', componentVariant: string | null = 'c001') =>
  block(id, y, { componentId, ...(componentVariant ? { componentVariant } : {}), massG: 55 });

export const JOINT_NAMES: Record<string, string> = { shoulder: 'Shoulder', elbow: 'Elbow', wrist: 'Wrist' };

const joint = (id: string, parent: string[], child: string[], y: number): RobotJoint => ({
  id,
  name: JOINT_NAMES[id],
  type: 'revolute',
  parent,
  child,
  origin: [0, y, 0],
  axis: [1, 0, 0],
  actuators: [parent[1]],
  limb: 'arm',
});

export const ARM = {
  name: 'arm',
  parts: [
    block('base', 20),
    servo('shoulder-servo', 70),
    block('upper', 130),
    servo('elbow-servo', 190),
    block('fore', 250),
  ],
  project: {
    ...DEFAULT_PROJECT,
    joints: [
      joint('shoulder', ['base', 'shoulder-servo'], ['upper', 'elbow-servo'], 70),
      joint('elbow', ['upper', 'elbow-servo'], ['fore'], 190),
    ],
  },
};

export const MIXED_ARM = {
  name: 'mixed arm',
  parts: [
    block('base', 20),
    servo('shoulder-servo', 70, 'feetech-sts3215', 'c046'),
    block('upper', 130),
    servo('elbow-servo', 190, 'dynamixel-xl430-w250', null),
    block('fore', 250),
  ],
  project: ARM.project,
};

export const THREE_JOINT_ARM = {
  name: 'three-joint arm',
  parts: [
    block('base', 20),
    servo('shoulder-servo', 70),
    block('upper', 130),
    servo('elbow-servo', 190),
    block('fore', 250),
    servo('wrist-servo', 310),
    block('hand', 370),
  ],
  project: {
    ...DEFAULT_PROJECT,
    joints: [
      joint('shoulder', ['base', 'shoulder-servo'], ['upper', 'elbow-servo'], 70),
      joint('elbow', ['upper', 'elbow-servo'], ['fore', 'wrist-servo'], 190),
      joint('wrist', ['fore', 'wrist-servo'], ['hand'], 310),
    ],
  },
};
