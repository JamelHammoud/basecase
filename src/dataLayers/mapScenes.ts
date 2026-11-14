import * as THREE from 'three';
import { definitionText, IMAGE_FIELDS, ROS2_HEADER, ROS2_TIME } from '../datasets/import/decode/rosBuiltins';
import { ROS2_ODOMETRY, ROS2_POINT_CLOUD2, ROS2_TF_MESSAGE } from '../datasets/import/decode/fixtures';
import type { FixtureMessage } from '../datasets/import/mcapFixtures';
import { cdrMessage } from '../datasets/import/topicFixtures';

const START = 1_700_000_000;

const ROS2_IMAGE = { name: 'sensor_msgs/msg/Image', text: definitionText(IMAGE_FIELDS, [ROS2_HEADER, ROS2_TIME]) };
const ROS2_CAMERA_INFO = {
  name: 'sensor_msgs/msg/CameraInfo',
  text: definitionText(
    [
      'std_msgs/Header header',
      'uint32 height',
      'uint32 width',
      'string distortion_model',
      'float64[] d',
      'float64[9] k',
    ],
    [ROS2_HEADER, ROS2_TIME],
  ),
};

const stamp = (seconds: number) => {
  const sec = Math.floor(seconds);

  return { sec, nanosec: Math.round((seconds - sec) * 1e9) };
};

const header = (time: number, frame: string) => ({ stamp: stamp(START + time), frame_id: frame });

const quat = (q: THREE.Quaternion) => ({ x: q.x, y: q.y, z: q.z, w: q.w });

const tfMessage = (time: number, child: string, pose: THREE.Matrix4) => {
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();

  pose.decompose(p, q, new THREE.Vector3());

  return cdrMessage(ROS2_TF_MESSAGE, '/tf', [
    START + time,
    {
      transforms: [
        {
          header: header(time, 'map'),
          child_frame_id: child,
          transform: { translation: { x: p.x, y: p.y, z: p.z }, rotation: quat(q) },
        },
      ],
    },
  ]);
};

export const ROOM_HALF_M = 2;
export const ROOM_HEIGHT_M = 2.5;

const LENS = { width: 128, height: 96, fx: 80, fy: 80, cx: 64, cy: 48 };
const CAMERA_HEIGHT_M = 1;
const CAMERA_PITCH = 0.35;
const OPTICAL = new THREE.Matrix4().set(0, 0, 1, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 0, 1);

function roomDepth(camera: THREE.Matrix4): Float32Array {
  const depth = new Float32Array(LENS.width * LENS.height);
  const origin = new THREE.Vector3().setFromMatrixPosition(camera);
  const turn = new THREE.Matrix3().setFromMatrix4(camera);
  const half = [ROOM_HALF_M, ROOM_HALF_M];

  for (let v = 0; v < LENS.height; v++)
    for (let u = 0; u < LENS.width; u++) {
      const d = new THREE.Vector3((u - LENS.cx) / LENS.fx, (v - LENS.cy) / LENS.fy, 1).applyMatrix3(turn);
      const exits = [0, 1].map(
        (a) => (Math.sign(d.getComponent(a)) * half[a] - origin.getComponent(a)) / d.getComponent(a),
      );
      const up = d.z > 0 ? (ROOM_HEIGHT_M - origin.z) / d.z : -origin.z / d.z;

      depth[v * LENS.width + u] = Math.min(...exits.filter((t) => t > 0), up);
    }

  return depth;
}

function cameraAt(yaw: number) {
  return new THREE.Matrix4()
    .makeRotationZ(yaw)
    .setPosition(0, 0, CAMERA_HEIGHT_M)
    .multiply(new THREE.Matrix4().makeRotationY(CAMERA_PITCH))
    .multiply(OPTICAL);
}

export function depthRoomMessages(frames = 36): FixtureMessage[] {
  return Array.from({ length: frames }, (_, i) => {
    const time = i / 6;
    const camera = cameraAt((i / frames) * Math.PI * 2);
    const depth = roomDepth(camera);

    return [
      tfMessage(time, 'camera_depth_optical_frame', camera),
      cdrMessage(ROS2_CAMERA_INFO, '/camera/depth/camera_info', [
        START + time,
        {
          header: header(time, 'camera_depth_optical_frame'),
          height: LENS.height,
          width: LENS.width,
          distortion_model: 'plumb_bob',
          d: [],
          k: [LENS.fx, 0, LENS.cx, 0, LENS.fy, LENS.cy, 0, 0, 1],
        },
      ]),
      cdrMessage(ROS2_IMAGE, '/camera/depth/image_raw', [
        START + time,
        {
          header: header(time, 'camera_depth_optical_frame'),
          height: LENS.height,
          width: LENS.width,
          encoding: '32FC1',
          is_bigendian: 0,
          step: LENS.width * 4,
          data: new Uint8Array(depth.buffer),
        },
      ]),
    ];
  }).flat();
}

export const STEP_RISE_M = 0.15;
export const STEP_RUN_M = 0.4;
export const STEPS = 3;

const FIRST_STEP_M = 1;
const CLOUD_SPACING_M = 0.04;

export const stepHeight = (x: number) =>
  Math.max(0, Math.min(STEPS, Math.floor((x - FIRST_STEP_M) / STEP_RUN_M) + 1)) * STEP_RISE_M;

function stepCloud(body: THREE.Matrix4): Uint8Array {
  const ahead = new THREE.Vector3().setFromMatrixPosition(body);
  const toBody = body.clone().invert();
  const values: number[] = [];

  for (let x = ahead.x; x < ahead.x + 1.6; x += CLOUD_SPACING_M)
    for (let y = -0.6; y <= 0.6; y += CLOUD_SPACING_M) {
      const p = new THREE.Vector3(x, y, stepHeight(x)).applyMatrix4(toBody);

      values.push(p.x, p.y, p.z);
    }

  return new Uint8Array(Float32Array.from(values).buffer);
}

export function stairMessages(frames = 24): FixtureMessage[] {
  const fields = ['x', 'y', 'z'].map((name, i) => ({ name, offset: i * 4, datatype: 7, count: 1 }));

  return Array.from({ length: frames }, (_, i) => {
    const time = i / 4;
    const x = i * 0.1;
    const body = new THREE.Matrix4().setPosition(x, 0, stepHeight(x) + 0.3);
    const data = stepCloud(body);

    return [
      cdrMessage(ROS2_ODOMETRY, '/odom', [
        START + time,
        {
          header: header(time, 'odom'),
          child_frame_id: 'trunk',
          pose: { pose: { position: { x, y: 0, z: stepHeight(x) + 0.3 }, orientation: { w: 1 } } },
        },
      ]),
      cdrMessage(ROS2_POINT_CLOUD2, '/points', [
        START + time,
        {
          header: header(time, 'trunk'),
          height: 1,
          width: data.length / 12,
          fields,
          is_bigendian: false,
          point_step: 12,
          row_step: data.length,
          data,
          is_dense: true,
        },
      ]),
    ];
  }).flat();
}
