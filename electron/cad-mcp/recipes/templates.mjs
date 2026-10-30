import * as THREE from 'three';

const DEG = Math.PI / 180;
const INC = 'include <robotics.scad>\n';
const SERVO_KEY = 'component:feetech-sts3215|c018';
const MESH_FROM_SERVO = new THREE.Matrix4().makeRotationZ(Math.PI).setPosition(-12.5, 0, 17.5);
const SERVO_FROM_MESH = MESH_FROM_SERVO.clone().invert();

const r2 = (v) => {
  const x = Math.round(v * 100) / 100;

  return Object.is(x, -0) ? 0 : x;
};

const rotXYZ = ([x, y, z]) =>
  new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(x * DEG, y * DEG, z * DEG, 'XYZ'));
const frame = (pos, rot = [0, 0, 0]) => rotXYZ(rot).setPosition(...pos);

export function poseOf(matrix) {
  const e = new THREE.Euler().setFromRotationMatrix(matrix, 'XYZ');
  const p = new THREE.Vector3().setFromMatrixPosition(matrix);

  return { position: [p.x, p.y, p.z].map(r2), rotation: [e.x, e.y, e.z].map((v) => r2(v / DEG)) };
}

const step = (length, twist) => new THREE.Matrix4().makeTranslation(length, 0, 0).multiply(rotXYZ([twist, 0, 0]));

function servoChain({ prefix, label, start, holder, links, tip, joints }) {
  const parts = [];
  const servos = [];
  const specs = [];
  let J = start.clone();
  let parent = holder;

  links.forEach((link, k) => {
    const id = `${prefix}${link.id}`;

    servos.push({ id: `${prefix}${joints[k].id}-servo`, frame: J.clone() });
    parts.push({
      id,
      name: `${label}${link.name}`,
      code: `${INC}servo_link(${link.length}, ${link.twist});`,
      frame: J.clone(),
    });
    specs.push({
      ...joints[k],
      id: `${prefix}${joints[k].id}`,
      parent,
      child: id,
      servo: `${prefix}${joints[k].id}-servo`,
    });
    parent = id;
    J = J.clone().multiply(step(link.length, link.twist));
  });

  const last = joints[links.length];

  servos.push({ id: `${prefix}${last.id}-servo`, frame: J.clone() });
  parts.push({ id: `${prefix}${tip.id}`, name: `${label}${tip.name}`, code: `${INC}${tip.code}`, frame: J.clone() });
  specs.push({
    ...last,
    id: `${prefix}${last.id}`,
    parent,
    child: `${prefix}${tip.id}`,
    servo: `${prefix}${last.id}-servo`,
  });

  return { parts, servos, joints: specs };
}

function finish({ parts, servos, joints }) {
  return {
    parts: parts.map((p) => ({ ...p, ...poseOf(p.frame) })),
    servos: servos.map((s) => ({ ...s, catalog: SERVO_KEY, ...poseOf(s.frame.clone().multiply(SERVO_FROM_MESH)) })),
    joints: joints.map(({ servo, parent, child, ...j }) => ({
      ...j,
      parent: [parent, servo],
      child: [child],
      actuators: [servo],
    })),
  };
}

export const CATALOG_HORN = new THREE.Vector3(-12.5, 0, 18.9);

export function armTemplate() {
  const start = frame([0, 0, 47.4], [0, 0, -90]);
  const chain = servoChain({
    prefix: '',
    label: '',
    start,
    holder: 'arm-base',
    links: [
      { id: 'shoulder-bracket', name: 'Shoulder Bracket', length: 80, twist: 90 },
      { id: 'upper-arm', name: 'Upper Arm', length: 116, twist: 0 },
      { id: 'forearm', name: 'Forearm', length: 116, twist: 0 },
    ],
    tip: { id: 'wrist-flange', name: 'Wrist Flange', code: 'servo_u_link(reach = 28, mount = true);' },
    joints: [
      { id: 'base_yaw', name: 'Base Yaw', range: [-110, 110] },
      { id: 'shoulder_pitch', name: 'Shoulder Pitch', range: [-100, 100] },
      { id: 'elbow_pitch', name: 'Elbow Pitch', range: [-110, 110] },
      { id: 'wrist_pitch', name: 'Wrist Pitch', range: [-110, 110] },
    ],
  });

  chain.parts.unshift({ id: 'arm-base', name: 'Arm Base', code: `${INC}servo_base();`, frame: start.clone() });

  return finish(chain);
}

const HIP_X = 62;
const HIP_Z = 301.8;
const PLATE_Z = 38.15;
const PLATE = [174, 140, 8];
const PLATE_Y = -5;
const TRAY_Y = -40;
const BAY_Y = 32;
const TOP = PLATE_Z + PLATE[2];
const LEG_BASIS = new THREE.Matrix4().makeBasis(
  new THREE.Vector3(0, 0, -1),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0),
);
const TRAY_MOUNTS = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => [sx * 51.5, TRAY_Y + sy * 22]));
const BAY_MOUNTS = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => [sx * 40.68, BAY_Y + sy * 26]));

function scadRot(matrix) {
  const e = new THREE.Euler().setFromRotationMatrix(matrix, 'ZYX');

  return [e.x, e.y, e.z].map((v) => r2(v / DEG));
}

const legFrame = (sx) => LEG_BASIS.clone().setPosition(sx * HIP_X, 0, HIP_Z);
const legLabel = (side) => (side === 'left' ? 'Left' : 'Right');

function leg(side) {
  const sx = side === 'left' ? 1 : -1;
  const limb = `${side}_leg`;
  const name = (n) => `${legLabel(side)} ${n}`;

  return servoChain({
    prefix: `${side}-`,
    label: `${legLabel(side)} `,
    start: legFrame(sx),
    holder: 'hip-frame',
    links: [
      { id: 'hip-bracket', name: 'Hip Bracket', length: 80, twist: sx * 90 },
      { id: 'thigh', name: 'Thigh', length: 90, twist: 0 },
      { id: 'shin', name: 'Shin', length: 90, twist: 0 },
    ],
    tip: {
      id: 'foot',
      name: 'Foot',
      code: 'servo_u_link(reach = 28, mount = false);\nplaced([38.8, 0, -47.5]) printed_block([6, 110, 60], r = 3, top = 0.6, $ports = false);',
    },
    joints: [
      { id: 'hip_roll', name: name('Hip Roll'), range: [-15, 15], limb },
      { id: 'hip_pitch', name: name('Hip Pitch'), range: [-60, 60], limb },
      { id: 'knee', name: name('Knee'), range: [-90, 10], limb },
      { id: 'ankle', name: name('Ankle'), range: [-45, 45], limb },
    ],
  });
}

function hipFrameCode() {
  const rot = JSON.stringify(scadRot(LEG_BASIS));
  const inserts = JSON.stringify([...TRAY_MOUNTS, ...BAY_MOUNTS]);

  return `${INC}// Hip frame: both hip-roll cradles hang under one plate; the Pi 5 tray and the battery bay bolt on top.
for (sx = [-1, 1]) placed([sx * ${HIP_X}, 0, 0], ${rot}, sx > 0 ? "left_" : "right_") servo_cradle(STS3215);
difference() {
  translate([0, ${PLATE_Y}, ${PLATE_Z}]) printed_block(${JSON.stringify(PLATE)}, r = 8, $ports = false);
  for (p = ${inserts}) placed([p.x, p.y, ${r2(TOP)}]) heatset_hole(3, insert_len(3));
}`;
}

export function bipedTemplate() {
  const left = leg('left');
  const right = leg('right');
  const parts = [
    { id: 'hip-frame', name: 'Hip Frame', code: hipFrameCode(), frame: frame([0, 0, HIP_Z]) },
    { id: 'pi-tray', name: 'Pi 5 Tray', code: `${INC}pi5_tray();`, frame: frame([0, TRAY_Y, HIP_Z + TOP]) },
    {
      id: 'battery-bay',
      name: 'Battery Bay',
      code: `${INC}battery_bay(PACK_2S_2200, part = "bay");`,
      frame: frame([0, BAY_Y, HIP_Z + TOP], [180, 0, 0]),
    },
    ...left.parts,
    ...right.parts,
  ];

  return finish({ parts, servos: [...left.servos, ...right.servos], joints: [...left.joints, ...right.joints] });
}

export function formatTemplate(template) {
  const parts = template.parts.map(
    (p) =>
      `- ${p.id} (${p.name}) position ${JSON.stringify(p.position)} rotation ${JSON.stringify(p.rotation)}:\n${p.code}`,
  );
  const servos = template.servos.map(({ id, catalog, position, rotation }) => ({ id, catalog, position, rotation }));

  return [
    '1. model_part each printed part (code, position and rotation as listed):',
    ...parts,
    `2. add_parts the servos: ${JSON.stringify(servos)}`,
    `3. define_joints: ${JSON.stringify(template.joints)}`,
  ].join('\n');
}
