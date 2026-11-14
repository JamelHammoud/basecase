type Offset = [number, number, number];

export interface BvhNode {
  name: string;
  offset: Offset;
  channels: string[];
  children?: BvhNode[];
  end?: Offset;
}

const ROOT_CHANNELS = ['Xposition', 'Yposition', 'Zposition', 'Zrotation', 'Xrotation', 'Yrotation'];

const pad = (depth: number) => '  '.repeat(depth);

function nodeText(node: BvhNode, depth: number, root: boolean): string {
  const lines = [
    `${pad(depth)}${root ? 'ROOT' : 'JOINT'} ${node.name}`,
    `${pad(depth)}{`,
    `${pad(depth + 1)}OFFSET ${node.offset.join(' ')}`,
    `${pad(depth + 1)}CHANNELS ${node.channels.length} ${node.channels.join(' ')}`,
    ...(node.children ?? []).map((c) => nodeText(c, depth + 1, false)),
  ];

  if (node.end)
    lines.push(
      `${pad(depth + 1)}End Site`,
      `${pad(depth + 1)}{`,
      `${pad(depth + 2)}OFFSET ${node.end.join(' ')}`,
      `${pad(depth + 1)}}`,
    );

  lines.push(`${pad(depth)}}`);

  return lines.join('\n');
}

export function bvhText(root: BvhNode, rows: number[][], frameTime: number): string {
  const motion = rows.map((r) => r.map((v) => v.toFixed(4)).join(' '));

  return `HIERARCHY\n${nodeText(root, 0, true)}\nMOTION\nFrames: ${rows.length}\nFrame Time: ${frameTime}\n${motion.join('\n')}\n`;
}

export const ARM_LINKS = [120, 90, 60];
export const ARM_BASE = 20;
export const ARM_HEIGHT = ARM_BASE + ARM_LINKS.reduce((s, l) => s + l, 0);

const ARM: BvhNode = {
  name: 'Base',
  offset: [0, 0, 0],
  channels: ROOT_CHANNELS,
  children: [
    {
      name: 'Shoulder',
      offset: [0, ARM_BASE, 0],
      channels: ['Zrotation'],
      children: [
        {
          name: 'Elbow',
          offset: [0, ARM_LINKS[0], 0],
          channels: ['Zrotation'],
          children: [
            {
              name: 'Wrist',
              offset: [0, ARM_LINKS[1], 0],
              channels: ['Zrotation'],
              children: [{ name: 'Tip', offset: [0, ARM_LINKS[2], 0], channels: ['Zrotation'], end: [0, 10, 0] }],
            },
          ],
        },
      ],
    },
  ],
};

export interface ArmMotion {
  frames?: number;
  frameTime?: number;
  elbow?: (t: number) => number;
}

const wave = (t: number, period: number) => Math.sin((2 * Math.PI * t) / period);
const swing = (t: number, period: number) => 1 - Math.cos((2 * Math.PI * t) / period);

export function planarArmBvh({ frames = 61, frameTime = 1 / 30, elbow }: ArmMotion = {}): string {
  const rows = Array.from({ length: frames }, (_, f) => {
    const t = (f * 2) / (frames - 1);

    return [0, 0, 0, 0, 0, 0, 40 * wave(t, 2), elbow ? elbow(t) : 45 * swing(t, 2), 35 * swing(t, 1), 0];
  });

  return bvhText(ARM, rows, frameTime);
}

export const PAN_TILT_HEIGHT = 80;

const PAN_TILT: BvhNode = {
  name: 'Base',
  offset: [0, 0, 0],
  channels: ROOT_CHANNELS,
  children: [
    {
      name: 'Neck',
      offset: [0, 50, 0],
      channels: ['Yrotation', 'Xrotation'],
      children: [{ name: 'Head', offset: [0, 30, 20], channels: ['Zrotation'], end: [0, 0, 10] }],
    },
  ],
};

export function panTiltBvh(frames = 90): string {
  const rows = Array.from({ length: frames }, (_, f) => {
    const t = f / (frames - 1);
    const nod = t < 1 / 3 || t > 2 / 3 ? 20 * wave(t * 3, 1) : 0;
    const shake = t > 1 / 3 ? 30 * wave(t * 3, 1) : 0;

    return [0, 0, 0, 0, 0, 0, shake, nod, 0];
  });

  return bvhText(PAN_TILT, rows, 1 / 30);
}

export const LEG_LINKS = [20, 22];

const LEGS = [
  { name: 'FrontLeft', at: [15, 0, 25] as Offset, phase: 0 },
  { name: 'FrontRight', at: [-15, 0, 25] as Offset, phase: Math.PI },
  { name: 'RearLeft', at: [15, 0, -25] as Offset, phase: Math.PI },
  { name: 'RearRight', at: [-15, 0, -25] as Offset, phase: 0 },
];

const QUADRUPED: BvhNode = {
  name: 'Body',
  offset: [0, 0, 0],
  channels: ROOT_CHANNELS,
  children: LEGS.map((leg) => ({
    name: `${leg.name}Hip`,
    offset: leg.at,
    channels: ['Xrotation'],
    children: [
      {
        name: `${leg.name}Knee`,
        offset: [0, -LEG_LINKS[0], 0],
        channels: ['Xrotation'],
        children: [
          { name: `${leg.name}Foot`, offset: [0, -LEG_LINKS[1], 0], channels: ['Xrotation'], end: [0, -3, 0] },
        ],
      },
    ],
  })),
};

export function trotBvh(frames = 60): string {
  const rows = Array.from({ length: frames }, (_, f) => {
    const p = (f / frames) * 4 * Math.PI;
    const legs = LEGS.flatMap((leg) => [25 * Math.sin(p + leg.phase), -30 - 20 * Math.cos(p + leg.phase), 0]);

    return [0, 40 + 2 * Math.cos(2 * p), f * 2, 0, 3 * Math.sin(2 * p), 0, ...legs];
  });

  return bvhText(QUADRUPED, rows, 1 / 30);
}
