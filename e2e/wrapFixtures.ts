import * as THREE from 'three';

type V3 = [number, number, number];

interface Link {
  name: string;
  size: V3;
  at: V3;
}

interface Joint {
  name: string;
  parent: string;
  child: string;
  xyz: V3;
  rpy: V3;
  limits: [number, number];
}

const LINKS: Link[] = [
  { name: 'base_link', size: [0.07, 0.07, 0.06], at: [0.02, 0, 0.03] },
  { name: 'shoulder_link', size: [0.05, 0.04, 0.05], at: [-0.03, 0, -0.03] },
  { name: 'upper_arm_link', size: [0.12, 0.04, 0.03], at: [-0.06, -0.012, 0.018] },
  { name: 'lower_arm_link', size: [0.12, 0.035, 0.03], at: [-0.068, 0.003, 0.018] },
  { name: 'wrist_link', size: [0.03, 0.05, 0.03], at: [0, -0.035, 0.022] },
  { name: 'gripper_link', size: [0.03, 0.03, 0.06], at: [0, 0, -0.03] },
  { name: 'moving_jaw_so101_v1_link', size: [0.015, 0.05, 0.02], at: [0, -0.03, 0.019] },
];

const JOINTS: Joint[] = [
  {
    name: 'shoulder_pan',
    parent: 'base_link',
    child: 'shoulder_link',
    xyz: [0.0388, 0, 0.0624],
    rpy: [3.14159, 0, -3.14159],
    limits: [-1.92, 1.92],
  },
  {
    name: 'shoulder_lift',
    parent: 'shoulder_link',
    child: 'upper_arm_link',
    xyz: [-0.0304, -0.0183, -0.0542],
    rpy: [-1.5708, -1.5708, 0],
    limits: [-1.745, 1.745],
  },
  {
    name: 'elbow_flex',
    parent: 'upper_arm_link',
    child: 'lower_arm_link',
    xyz: [-0.1126, -0.028, 0],
    rpy: [0, 0, 1.5708],
    limits: [-1.69, 1.69],
  },
  {
    name: 'wrist_flex',
    parent: 'lower_arm_link',
    child: 'wrist_link',
    xyz: [-0.1349, 0.0052, 0],
    rpy: [0, 0, -1.5708],
    limits: [-1.658, 1.658],
  },
  {
    name: 'wrist_roll',
    parent: 'wrist_link',
    child: 'gripper_link',
    xyz: [0, -0.0611, 0.0181],
    rpy: [1.5708, 0.0487, 3.14159],
    limits: [-2.744, 2.841],
  },
  {
    name: 'gripper',
    parent: 'gripper_link',
    child: 'moving_jaw_so101_v1_link',
    xyz: [0.0202, 0.0188, -0.0234],
    rpy: [1.5708, 0, 0],
    limits: [-0.1745, 1.745],
  },
];

const v = (values: number[]) => values.join(' ');

const linkXml = (l: Link) => `  <link name="${l.name}">
    <inertial><origin xyz="${v(l.at)}"/><mass value="0.05"/></inertial>
    <visual><origin xyz="${v(l.at)}"/><geometry><box size="${v(l.size)}"/></geometry></visual>
  </link>`;

const jointXml = (j: Joint) => `  <joint name="${j.name}" type="revolute">
    <origin xyz="${v(j.xyz)}" rpy="${v(j.rpy)}"/>
    <parent link="${j.parent}"/><child link="${j.child}"/><axis xyz="0 0 1"/>
    <limit effort="10" velocity="10" lower="${j.limits[0]}" upper="${j.limits[1]}"/>
  </joint>`;

export const SO101_LINKS = LINKS.length;

export const so101Urdf = () =>
  ['<robot name="so101_new_calib">', ...LINKS.map(linkXml), ...JOINTS.map(jointXml), '</robot>'].join('\n');

const ROUNDNESS = 4;

function roundedCube(radius: number): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(radius, 48, 32);
  const position = geometry.getAttribute('position');
  const p = new THREE.Vector3();

  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i).normalize();

    const norm =
      (Math.abs(p.x) ** ROUNDNESS + Math.abs(p.y) ** ROUNDNESS + Math.abs(p.z) ** ROUNDNESS) ** (1 / ROUNDNESS);

    p.multiplyScalar(radius / norm);
    position.setXYZ(i, p.x, p.y, p.z);
  }

  return geometry;
}

const padded = (bytes: Uint8Array, fill: number) => {
  const out = new Uint8Array(Math.ceil(bytes.length / 4) * 4).fill(fill);

  out.set(bytes);

  return out;
};

export function roundedCubeGlb(radius = 0.05): Uint8Array {
  const geometry = roundedCube(radius);
  const positions = new Float32Array(geometry.getAttribute('position').array);
  const indices = new Uint32Array(geometry.index!.array);
  const box = new THREE.Box3().setFromArray(positions);
  const bin = padded(new Uint8Array([...new Uint8Array(positions.buffer), ...new Uint8Array(indices.buffer)]), 0);
  const gltf = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength, target: 34962 },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength, target: 34963 },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: positions.length / 3,
        type: 'VEC3',
        min: box.min.toArray(),
        max: box.max.toArray(),
      },
      { bufferView: 1, componentType: 5125, count: indices.length, type: 'SCALAR' },
    ],
  };
  const json = padded(new TextEncoder().encode(JSON.stringify(gltf)), 0x20);
  const out = new Uint8Array(12 + 8 + json.length + 8 + bin.length);
  const view = new DataView(out.buffer);

  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, out.length, true);
  view.setUint32(12, json.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  out.set(json, 20);
  view.setUint32(20 + json.length, bin.length, true);
  view.setUint32(24 + json.length, 0x004e4942, true);
  out.set(bin, 28 + json.length);

  return out;
}
