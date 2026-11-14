import type { RobotJoint, ScenePart } from '../types/robotics';
import type { PointOf } from './animationGoals';
import { buildRig, linkParts, type Rig, type V3 } from './kinematics';

type Side = 'left' | 'right';

interface Link {
  joint: string;
  axis: V3;
  origin: V3;
  range: [number, number];
  center: V3;
  size: V3;
}

const box = (id: string, center: V3, size: V3): ScenePart => ({
  id,
  name: id,
  kind: 'box',
  category: 'structure',
  role: 'solid',
  position: center,
  rotation: [0, 0, 0],
  dimensions: { width: size[0], height: size[1], depth: size[2] },
  color: '#888888',
  note: '',
  visible: true,
  locked: false,
});

const KNOB: V3 = [40, 40, 40];

function legLinks(s: number): Link[] {
  const x = s * 100;

  return [
    { joint: 'hip_pitch', axis: [1, 0, 0], origin: [x, 760, 0], range: [-150, 160], center: [x, 760, 0], size: KNOB },
    { joint: 'hip_roll', axis: [0, 0, 1], origin: [x, 760, 0], range: [-30, 170], center: [x, 740, 0], size: KNOB },
    {
      joint: 'hip_yaw',
      axis: [0, 1, 0],
      origin: [x, 760, 0],
      range: [-158, 158],
      center: [x, 600, 0],
      size: [80, 300, 80],
    },
    { joint: 'knee', axis: [1, 0, 0], origin: [x, 450, 0], range: [-5, 165], center: [x, 270, 0], size: [70, 340, 70] },
    { joint: 'ankle_pitch', axis: [1, 0, 0], origin: [x, 80, 0], range: [-50, 30], center: [x, 80, 0], size: KNOB },
    {
      joint: 'ankle_roll',
      axis: [0, 0, 1],
      origin: [x, 80, 0],
      range: [-15, 15],
      center: [x, 30, 40],
      size: [100, 60, 200],
    },
  ];
}

function armLinks(s: number): Link[] {
  const x = s * 200;

  return [
    {
      joint: 'shoulder_pitch',
      axis: [1, 0, 0],
      origin: [x, 1180, 0],
      range: [-177, 153],
      center: [x, 1180, 0],
      size: KNOB,
    },
    {
      joint: 'shoulder_roll',
      axis: [0, 0, 1],
      origin: [x, 1180, 0],
      range: [-90, 120],
      center: [x, 1170, 0],
      size: KNOB,
    },
    {
      joint: 'shoulder_yaw',
      axis: [0, 1, 0],
      origin: [x, 1180, 0],
      range: [-150, 150],
      center: [x, 1060, 0],
      size: [60, 200, 60],
    },
    {
      joint: 'elbow',
      axis: [1, 0, 0],
      origin: [x, 950, 0],
      range: [-60, 120],
      center: [x, 850, 0],
      size: [50, 180, 50],
    },
    { joint: 'wrist_roll', axis: [0, 1, 0], origin: [x, 750, 0], range: [-115, 115], center: [x, 750, 0], size: KNOB },
    { joint: 'wrist_pitch', axis: [1, 0, 0], origin: [x, 750, 0], range: [-92, 92], center: [x, 745, 0], size: KNOB },
    {
      joint: 'wrist_yaw',
      axis: [0, 0, 1],
      origin: [x, 750, 0],
      range: [-92, 92],
      center: [x, 680, 0],
      size: [70, 100, 30],
    },
  ];
}

const WAIST: Link[] = [
  { joint: 'waist_yaw', axis: [0, 1, 0], origin: [0, 850, 0], range: [-150, 150], center: [0, 850, 0], size: KNOB },
  { joint: 'waist_roll', axis: [0, 0, 1], origin: [0, 850, 0], range: [-30, 30], center: [0, 860, 0], size: KNOB },
  {
    joint: 'waist_pitch',
    axis: [1, 0, 0],
    origin: [0, 850, 0],
    range: [-30, 30],
    center: [0, 1050, 0],
    size: [300, 300, 150],
  },
];

function chain(links: Link[], from: string, prefix: string, out: { parts: ScenePart[]; joints: RobotJoint[] }) {
  let parent = from;

  for (const l of links) {
    const id = `${prefix}${l.joint}_joint`;
    const link = `${prefix}${l.joint}_link`;

    out.parts.push(box(link, l.center, l.size));
    out.joints.push({
      id,
      name: id,
      type: 'revolute',
      parent: [parent],
      child: [link],
      origin: l.origin,
      axis: l.axis,
      range: l.range,
    });
    parent = link;
  }

  return parent;
}

export function humanoid(): { parts: ScenePart[]; joints: RobotJoint[]; rig: Rig; pointOf: PointOf } {
  const out = { parts: [box('pelvis', [0, 800, 0], [260, 120, 160])], joints: [] as RobotJoint[] };
  const torso = chain(WAIST, 'pelvis', '', out);

  for (const [side, s] of [
    ['left', 1],
    ['right', -1],
  ] as Array<[Side, number]>) {
    chain(legLinks(s), 'pelvis', `${side}_`, out);
    chain(armLinks(s), torso, `${side}_`, out);
  }

  const rig = buildRig(out.joints, out.parts);
  const byId = new Map(out.parts.map((p) => [p.id, p]));
  const pointOf: PointOf = (id, where) => {
    const ids = rig.byId.has(id) ? linkParts(rig, id) : [id];
    const boxes = ids.map((p) => byId.get(p)).filter((p): p is ScenePart => !!p);

    if (!boxes.length) return null;

    const lo = [0, 1, 2].map((i) => Math.min(...boxes.map((b) => b.position[i] - dims(b)[i] / 2)));
    const hi = [0, 1, 2].map((i) => Math.max(...boxes.map((b) => b.position[i] + dims(b)[i] / 2)));
    const c: V3 = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];

    return where === 'bottom' ? [c[0], lo[1], c[2]] : c;
  };

  return { ...out, rig, pointOf };
}

const dims = (p: ScenePart): V3 => [p.dimensions.width, p.dimensions.height, p.dimensions.depth];

const HIERARCHY = `HIERARCHY
ROOT Hips
{
  OFFSET 0 0 0
  CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation
  JOINT Spine
  {
    OFFSET 0 10 0
    CHANNELS 3 Zrotation Xrotation Yrotation
    JOINT Spine1
    {
      OFFSET 0 20 0
      CHANNELS 3 Zrotation Xrotation Yrotation
      JOINT Neck
      {
        OFFSET 0 20 0
        CHANNELS 3 Zrotation Xrotation Yrotation
        JOINT Head
        {
          OFFSET 0 10 0
          CHANNELS 3 Zrotation Xrotation Yrotation
          End Site
          {
            OFFSET 0 15 0
          }
        }
      }
${arm('Left', 1)}
${arm('Right', -1)}
    }
  }
${leg('Left', 1)}
${leg('Right', -1)}
}
`;

function arm(side: string, s: number) {
  return `      JOINT ${side}Arm
      {
        OFFSET ${18 * s} 15 0
        CHANNELS 3 Zrotation Xrotation Yrotation
        JOINT ${side}ForeArm
        {
          OFFSET ${28 * s} 0 0
          CHANNELS 3 Zrotation Xrotation Yrotation
          JOINT ${side}Hand
          {
            OFFSET ${25 * s} 0 0
            CHANNELS 3 Zrotation Xrotation Yrotation
            End Site
            {
              OFFSET ${8 * s} 0 0
            }
          }
        }
      }`;
}

function leg(side: string, s: number) {
  return `  JOINT ${side}UpLeg
  {
    OFFSET ${10 * s} -5 0
    CHANNELS 3 Zrotation Xrotation Yrotation
    JOINT ${side}Leg
    {
      OFFSET 0 -42 0
      CHANNELS 3 Zrotation Xrotation Yrotation
      JOINT ${side}Foot
      {
        OFFSET 0 -40 0
        CHANNELS 3 Zrotation Xrotation Yrotation
        JOINT ${side}ToeBase
        {
          OFFSET 0 -6 12
          CHANNELS 3 Zrotation Xrotation Yrotation
          End Site
          {
            OFFSET 0 0 4
          }
        }
      }
    }
  }`;
}

const r = (v: number) => v.toFixed(3);

function frameChannels(f: number): number[] {
  const p = (f / 15) * Math.PI * 2;
  const sin = Math.sin(p),
    cos = Math.cos(p);
  const arms = (s: number) => [-s * (70 + 10 * sin), 30 * sin * s, 0, 0, 0, -s * (40 + 30 * cos), 0, 10 * sin, 0];
  const legs = (s: number) => [0, 25 * sin * s, 0, 0, 30 * (1 + cos * s), 0, 0, -10 * sin * s, 0, 0, 0, 0];
  const hips = [2 * sin, 90 + 2 * Math.abs(cos), f * 3, 3 * sin, 2 * cos, 5 * sin];
  const spine = [0, 5 * sin, 0, 0, 4 * cos, 10 * sin, 0, 10 * sin, 0, 0, 0, 15 * sin];

  return [...hips, ...spine, ...arms(1), ...arms(-1), ...legs(1), ...legs(-1)];
}

export function walkBvh(frames = 16): string {
  const rows = Array.from({ length: frames }, (_, f) => frameChannels(f).map(r).join(' '));

  return `${HIERARCHY}MOTION\nFrames: ${frames}\nFrame Time: 0.0333333\n${rows.join('\n')}\n`;
}

function waveChannels(t: number): number[] {
  const beat = Math.sin(2 * Math.PI * 1.5 * t);
  const still = (n: number) => Array.from({ length: n }, () => 0);
  const leftArm = [-70, 0, 0, ...still(6)];
  const rightArm = [-60 - 5 * beat, 0, 0, -40 - 30 * beat, 0, 0, 0, 10 * beat, 0];

  return [...still(6), ...still(12), ...leftArm, ...rightArm, ...still(24)];
}

export function waveBvh(frames = 61): string {
  const rows = Array.from({ length: frames }, (_, f) =>
    waveChannels(f / 30)
      .map(r)
      .join(' '),
  );

  return `${HIERARCHY}MOTION\nFrames: ${frames}\nFrame Time: 0.0333333\n${rows.join('\n')}\n`;
}
