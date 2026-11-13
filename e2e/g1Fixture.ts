import { DEFAULT_PROJECT, type RobotJoint, type ScenePart } from '../src/types/robotics';

type Vec = [number, number, number];

const AXES: Record<string, Vec> = {
  pitch: [1, 0, 0],
  roll: [0, 0, 1],
  yaw: [0, 1, 0],
  knee: [1, 0, 0],
  elbow: [1, 0, 0],
};

const box = (id: string, position: Vec, size: Vec = [40, 40, 40]): ScenePart => ({
  id,
  name: id,
  kind: 'box',
  category: 'structure',
  role: 'solid',
  position,
  rotation: [0, 0, 0],
  dimensions: { width: size[0], height: size[1], depth: size[2] },
  color: '#888888',
  note: '',
  visible: true,
  locked: false,
  massG: 400,
});

const limbOf = (name: string): RobotJoint['limb'] => {
  if (/hip|knee|ankle/.test(name)) return 'leg';

  return /shoulder|elbow|wrist/.test(name) ? 'arm' : 'torso';
};

interface Link {
  name: string;
  at: Vec;
  part?: ScenePart;
}

function chain(base: string, links: Link[]) {
  const parts: ScenePart[] = [];
  const joints: RobotJoint[] = [];

  links.reduce((parent, { name, at, part }) => {
    const child = part ?? box(`${name}-link`, at);
    const kind = name.replace(/^(left|right)_/, '').replace(/_joint$/, '');

    parts.push(child);
    joints.push({
      id: name,
      name,
      type: 'revolute',
      parent: [parent],
      child: [child.id],
      origin: at,
      axis: AXES[kind.split('_').at(-1) ?? 'pitch'] ?? AXES.pitch,
      range: [-150, 150],
      limb: limbOf(name),
    });

    return child.id;
  }, base);

  return { parts, joints };
}

const SIDES: Array<['left' | 'right', number]> = [
  ['left', 1],
  ['right', -1],
];

const leg = ([side, s]: [string, number]) =>
  chain('pelvis', [
    { name: `${side}_hip_pitch_joint`, at: [s * 90, 660, 0] },
    { name: `${side}_hip_roll_joint`, at: [s * 90, 620, 0] },
    {
      name: `${side}_hip_yaw_joint`,
      at: [s * 90, 520, 0],
      part: box(`${side}-thigh`, [s * 90, 470, 0], [60, 140, 60]),
    },
    { name: `${side}_knee_joint`, at: [s * 90, 380, 0], part: box(`${side}-shin`, [s * 90, 260, 0], [50, 200, 50]) },
    { name: `${side}_ankle_pitch_joint`, at: [s * 90, 120, 0] },
    {
      name: `${side}_ankle_roll_joint`,
      at: [s * 90, 40, 20],
      part: box(`${side}-foot`, [s * 90, 20, 20], [80, 40, 160]),
    },
  ]);

const waist = () =>
  chain('pelvis', [
    { name: 'waist_yaw_joint', at: [0, 740, 0] },
    { name: 'waist_roll_joint', at: [0, 780, 0] },
    { name: 'waist_pitch_joint', at: [0, 820, 0], part: box('torso', [0, 960, 0], [220, 240, 120]) },
  ]);

const arm = ([side, s]: [string, number]) =>
  chain('torso', [
    { name: `${side}_shoulder_pitch_joint`, at: [s * 140, 1060, 0] },
    { name: `${side}_shoulder_roll_joint`, at: [s * 180, 1060, 0] },
    {
      name: `${side}_shoulder_yaw_joint`,
      at: [s * 180, 980, 0],
      part: box(`${side}-upper-arm`, [s * 180, 960, 0], [50, 140, 50]),
    },
    {
      name: `${side}_elbow_joint`,
      at: [s * 180, 880, 0],
      part: box(`${side}-forearm`, [s * 180, 820, 0], [45, 120, 45]),
    },
    { name: `${side}_wrist_roll_joint`, at: [s * 180, 750, 0] },
    { name: `${side}_wrist_pitch_joint`, at: [s * 180, 710, 0] },
    {
      name: `${side}_wrist_yaw_joint`,
      at: [s * 180, 670, 0],
      part: box(`${side}-hand`, [s * 180, 640, 0], [40, 60, 30]),
    },
  ]);

export function g1Humanoid() {
  const limbs = [...SIDES.map(leg), waist(), ...SIDES.map(arm)];

  return {
    name: 'Unitree G1',
    parts: [box('pelvis', [0, 700, 0], [200, 100, 120]), ...limbs.flatMap((l) => l.parts)],
    project: { ...DEFAULT_PROJECT, joints: limbs.flatMap((l) => l.joints) },
  };
}
