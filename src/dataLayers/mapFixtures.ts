import { ROS2_LASER_SCAN, ROS2_ODOMETRY, ROS2_TF_MESSAGE } from '../datasets/import/decode/fixtures';
import { writeMcap, type FixtureMessage } from '../datasets/import/mcapFixtures';
import { cdrMessage } from '../datasets/import/topicFixtures';

export interface Pose2 {
  x: number;
  y: number;
  yaw: number;
}

type Segment = [number, number, number, number];

const OUTER: [number, number, number, number] = [-1, -1, 9, 7];
const INNER: [number, number, number, number] = [1, 1, 7, 5];
const POST_M = 0.3;
const POSTS: Array<[number, number]> = [
  [2.3, -0.8],
  [5.7, -0.8],
  [8.8, 2.4],
  [8.8, 4.1],
  [6.1, 6.8],
  [3.2, 6.8],
  [-0.8, 4.6],
  [-0.8, 1.7],
];
const SPEED = 0.5;
const TURN = 0.5;
const LEGS = [8, 6, 8, 6];
const RAYS = 360;
const RANGE_MAX = 12;
const SCAN_HZ = 5;
const ODOM_HZ = 20;
const SCANNER_Z = 0.17;

export const CORRIDOR_START = 1_700_000_000;

const box = ([x0, y0, x1, y1]: [number, number, number, number]): Segment[] => [
  [x0, y0, x1, y0],
  [x1, y0, x1, y1],
  [x1, y1, x0, y1],
  [x0, y1, x0, y0],
];

const WALLS: Segment[] = [
  ...box(OUTER),
  ...box(INNER),
  ...POSTS.flatMap(([x, y]) => box([x - POST_M / 2, y - POST_M / 2, x + POST_M / 2, y + POST_M / 2])),
];

const TURN_S = Math.PI / 2 / TURN;

export const CORRIDOR_SECONDS = LEGS.reduce((sum, m) => sum + m / SPEED + TURN_S, 0);

export function corridorTruth(time: number): Pose2 {
  let x = 0;
  let y = 0;
  let yaw = 0;
  let left = Math.max(0, time);

  for (const leg of LEGS) {
    const drive = Math.min(left, leg / SPEED);

    x += Math.cos(yaw) * drive * SPEED;
    y += Math.sin(yaw) * drive * SPEED;
    left -= drive;

    const turn = Math.min(left, TURN_S);

    yaw += turn * TURN;
    left -= turn;
  }

  return { x, y, yaw };
}

function rayHit(from: Pose2, angle: number): number {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let best = Infinity;

  for (const [x0, y0, x1, y1] of WALLS) {
    const ex = x1 - x0;
    const ey = y1 - y0;
    const denom = dx * ey - dy * ex;

    if (Math.abs(denom) < 1e-12) continue;

    const t = ((x0 - from.x) * ey - (y0 - from.y) * ex) / denom;
    const u = ((x0 - from.x) * dy - (y0 - from.y) * dx) / denom;

    if (t > 0 && u >= 0 && u <= 1) best = Math.min(best, t);
  }

  return best;
}

const ripple = (i: number, k: number) => 0.004 * Math.sin(i * 12.9898 + k * 78.233);

export function corridorRanges(at: Pose2, k = 0): number[] {
  return Array.from({ length: RAYS }, (_, i) => {
    const r = rayHit(at, at.yaw - Math.PI + (i * 2 * Math.PI) / RAYS);

    return r <= RANGE_MAX ? r + ripple(i, k) : 0;
  });
}

export interface Drift {
  turnScale: number;
  yawRate: number;
  speedScale: number;
}

export const CORRIDOR_DRIFT: Drift = { turnScale: 1.03, yawRate: 0.003, speedScale: 1.02 };

export function driftedOdometry(drift: Drift = CORRIDOR_DRIFT): Array<{ time: number; pose: Pose2 }> {
  const dt = 1 / ODOM_HZ;
  const out = [{ time: 0, pose: { x: 0, y: 0, yaw: 0 } }];
  const steps = Math.ceil(CORRIDOR_SECONDS * ODOM_HZ);
  let pose = out[0].pose;

  for (let n = 1; n <= steps; n++) {
    const a = corridorTruth((n - 1) * dt);
    const b = corridorTruth(n * dt);
    const turned = (b.yaw - a.yaw) * drift.turnScale + drift.yawRate * dt;
    const moved = Math.hypot(b.x - a.x, b.y - a.y) * drift.speedScale;
    const yaw = pose.yaw + turned;

    pose = { x: pose.x + Math.cos(yaw) * moved, y: pose.y + Math.sin(yaw) * moved, yaw };
    out.push({ time: n * dt, pose });
  }

  return out;
}

const stamp = (seconds: number) => {
  const sec = Math.floor(seconds);

  return { sec, nanosec: Math.round((seconds - sec) * 1e9) };
};

const header = (seconds: number, frame: string) => ({ stamp: stamp(seconds), frame_id: frame });

const yawQuat = (yaw: number) => ({ x: 0, y: 0, z: Math.sin(yaw / 2), w: Math.cos(yaw / 2) });

const odomMessage = ({ time, pose }: { time: number; pose: Pose2 }) =>
  cdrMessage(ROS2_ODOMETRY, '/odom', [
    CORRIDOR_START + time,
    {
      header: header(CORRIDOR_START + time, 'odom'),
      child_frame_id: 'base_footprint',
      pose: { pose: { position: { x: pose.x, y: pose.y, z: 0 }, orientation: yawQuat(pose.yaw) } },
    },
  ]);

const scanMessage = (time: number, k: number) =>
  cdrMessage(ROS2_LASER_SCAN, '/scan', [
    CORRIDOR_START + time,
    {
      header: header(CORRIDOR_START + time, 'base_scan'),
      angle_min: -Math.PI,
      angle_max: Math.PI - (2 * Math.PI) / RAYS,
      angle_increment: (2 * Math.PI) / RAYS,
      range_min: 0.12,
      range_max: RANGE_MAX,
      ranges: corridorRanges(corridorTruth(time), k),
    },
  ]);

const staticFrames = () =>
  cdrMessage(ROS2_TF_MESSAGE, '/tf_static', [
    CORRIDOR_START,
    {
      transforms: [
        {
          header: header(CORRIDOR_START, 'base_footprint'),
          child_frame_id: 'base_scan',
          transform: { translation: { x: 0, y: 0, z: SCANNER_Z }, rotation: { w: 1 } },
        },
      ],
    },
  ]);

export function corridorMessages(drift: Drift = CORRIDOR_DRIFT): FixtureMessage[] {
  const scans = Math.floor(CORRIDOR_SECONDS * SCAN_HZ);

  return [
    staticFrames(),
    ...driftedOdometry(drift).map(odomMessage),
    ...Array.from({ length: scans + 1 }, (_, k) => scanMessage(k / SCAN_HZ, k)),
  ];
}

export const corridorMcap = (drift: Drift = CORRIDOR_DRIFT) =>
  writeMcap(corridorMessages(drift), { chunked: true, compression: 'zstd' });
