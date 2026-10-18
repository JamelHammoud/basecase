import * as THREE from 'three';
import type { AccentMaterial, BuildContext } from './context';
import type { PartBuilder } from './primitives';

type Vec3 = [number, number, number];

const place = (ctx: BuildContext, geometry: THREE.BufferGeometry, accent: AccentMaterial, at: Vec3 = [0, 0, 0]) => {
  const mesh = ctx.add(geometry, ctx.material(accent));

  mesh.position.set(...at);

  return mesh;
};

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

const cylinder = (r: number, h: number, segments: number) => new THREE.CylinderGeometry(r, r, h, segments);

const servo: PartBuilder = (ctx) => {
  const { width: w, height: h, depth: d } = ctx;
  const bodyW = w * 0.74;
  const shaftX = bodyW * 0.24;
  const bossR = Math.min(bodyW, d) * 0.28;

  place(ctx, box(bodyW, h * 0.82, d), 'primary', [0, -h * 0.06, 0]);
  place(ctx, box(w, Math.max(2.5, h * 0.08), d), 'primary', [0, h * 0.14, 0]);
  place(ctx, cylinder(bossR, h * 0.14, 24), 'dark', [shaftX, h * 0.38, 0]);
  place(ctx, box(bodyW * 0.65, Math.max(2, h * 0.06), d * 0.36), 'metal', [shaftX, h * 0.47, 0]);
  place(ctx, cylinder(bossR * 0.45, h * 0.1, 16), 'brass', [shaftX, h * 0.48, 0]);
};

const stepperMotor: PartBuilder = (ctx) => {
  const { width: w, height: h, depth: d } = ctx;
  const bodyH = h * 0.72;
  const shaftH = h * 0.28;

  place(ctx, box(w, bodyH, d), 'primary', [0, -h * 0.14, 0]);
  place(ctx, cylinder(Math.min(w, d) * 0.26, h * 0.06, 24), 'metal', [0, bodyH / 2 - h * 0.14 + h * 0.03, 0]);
  place(ctx, cylinder(Math.max(2.5, Math.min(w, d) * 0.07), shaftH, 20), 'metal', [0, h / 2 - shaftH / 2, 0]);
};

const hingeJoint: PartBuilder = (ctx) => {
  const { width: w, height: h, depth: d } = ctx;
  const pin = cylinder(Math.max(2, Math.min(h, d) * 0.12), w * 1.18, 20);

  pin.rotateZ(Math.PI / 2);
  place(ctx, box(w, h * 0.48, d), 'primary', [0, -h * 0.26, 0]);
  place(ctx, box(w * 0.65, h * 0.52, d * 0.85), 'primary', [0, h * 0.24, 0]);
  place(ctx, pin, 'metal');
};

const linearActuator: PartBuilder = (ctx) => {
  const { width: w, height: h, depth: d } = ctx;
  const cylR = Math.min(w, d) * 0.42;

  place(ctx, cylinder(cylR, h * 0.62, 24), 'primary', [0, -h * 0.19, 0]);
  place(ctx, cylinder(cylR * 0.48, h * 0.42, 20), 'metal', [0, h * 0.25, 0]);
  place(ctx, box(cylR * 1.1, h * 0.1, cylR * 1.1), 'dark', [0, h * 0.45, 0]);
};

const lBracket: PartBuilder = (ctx) => {
  const { width: w, height: h, depth: d } = ctx;
  const t = Math.min(ctx.thickness, Math.min(w, h) * 0.35);

  place(ctx, box(w, t, d), 'primary', [0, -h / 2 + t / 2, 0]);
  place(ctx, box(t, h - t, d), 'primary', [-w / 2 + t / 2, t / 2, 0]);
};

const uBracket: PartBuilder = (ctx) => {
  const { width: w, height: h, depth: d } = ctx;
  const t = Math.min(ctx.thickness, Math.min(w, h) * 0.25);
  const armH = h - t;
  const arm = box(t, armH, d);
  const peg = cylinder(Math.min(d, armH) * 0.16, t * 1.2, 16);
  const pegY = h / 2 - d * 0.35;

  peg.rotateZ(Math.PI / 2);
  place(ctx, box(w, t, d), 'primary', [0, -h / 2 + t / 2, 0]);
  place(ctx, arm, 'primary', [-w / 2 + t / 2, t / 2, 0]);
  place(ctx, arm, 'primary', [w / 2 - t / 2, t / 2, 0]);
  place(ctx, peg, 'dark', [-w / 2 + t / 2, pegY, 0]);
  place(ctx, peg, 'dark', [w / 2 - t / 2, pegY, 0]);
};

const beam: PartBuilder = (ctx) => {
  const { width: w, height: h, depth: d } = ctx;

  ctx.add(ctx.deform(new THREE.BoxGeometry(w, h, d, 14, 4, 4)));

  if (ctx.deformed) {
    return;
  }

  const count = Math.max(2, Math.min(8, Math.floor(w / 16)));
  const spacing = w / (count + 1);
  const dot = cylinder(Math.min(h, d) * 0.2, h * 1.03, 14);

  for (let i = 1; i <= count; i++) place(ctx, dot, 'dark', [-w / 2 + i * spacing, 0, 0]);
};

const standoff: PartBuilder = (ctx) => {
  const r = Math.min(ctx.width, ctx.depth) / 2;

  place(ctx, new THREE.CylinderGeometry(r, r, ctx.height, 6), 'primary');
  place(ctx, cylinder(r * 0.45, ctx.height * 1.02, 14), 'dark');
};

const wheel: PartBuilder = (ctx) => {
  const r = Math.min(ctx.width, ctx.depth) / 2;
  const h = ctx.height;

  place(ctx, cylinder(r, h, 32), 'primary');
  place(ctx, cylinder(r * 0.62, h * 1.04, 24), 'metal');
  place(ctx, cylinder(r * 0.16, h * 1.08, 16), 'dark');
};

const gripper: PartBuilder = (ctx) => {
  const { width: w, height: h, depth: d } = ctx;
  const palmH = h * 0.34;
  const fingerW = Math.max(4, w * 0.14);
  const fingerH = h - palmH;
  const finger = box(fingerW, fingerH, d * 0.72);
  const tip = box(fingerW * 1.5, fingerH * 0.25, d * 0.74);
  const tipY = h / 2 - fingerH * 0.13;

  place(ctx, box(w, palmH, d), 'primary', [0, -h / 2 + palmH / 2, 0]);
  place(ctx, finger, 'metal', [-w * 0.32, palmH / 2, 0]);
  place(ctx, finger, 'metal', [w * 0.32, palmH / 2, 0]);
  place(ctx, tip, 'dark', [-w * 0.28, tipY, 0]);
  place(ctx, tip, 'dark', [w * 0.28, tipY, 0]);
};

const bearingBlock: PartBuilder = (ctx) => {
  const { width: w, height: h, depth: d } = ctx;
  const flangeH = h * 0.28;
  const housingR = Math.min(w * 0.32, h * 0.45);
  const housing = cylinder(housingR, d, 24);
  const bore = cylinder(housingR * 0.52, d * 1.05, 20);

  housing.rotateX(Math.PI / 2);
  bore.rotateX(Math.PI / 2);
  place(ctx, box(w, flangeH, d), 'primary', [0, -h / 2 + flangeH / 2, 0]);
  place(ctx, housing, 'primary', [0, h * 0.06, 0]);
  place(ctx, bore, 'dark', [0, h * 0.06, 0]);
};

const cameraModule: PartBuilder = (ctx) => {
  const { width: w, height: h, depth: d } = ctx;
  const pcbD = d * 0.45;
  const lensD = d * 0.55;
  const lens = cylinder(Math.min(w, h) * 0.34, lensD, 24);

  lens.rotateX(Math.PI / 2);
  place(ctx, box(w, h, pcbD), 'primary', [0, 0, -d / 2 + pcbD / 2]);
  place(ctx, lens, 'dark', [0, 0, d / 2 - lensD / 2]);
};

const ultrasonic: PartBuilder = (ctx) => {
  const { width: w, height: h, depth: d } = ctx;
  const pcbD = d * 0.25;
  const eyeD = d * 0.75;
  const eye = cylinder(Math.min(w * 0.18, h * 0.42), eyeD, 24);

  eye.rotateX(Math.PI / 2);
  place(ctx, box(w, h, pcbD), 'primary', [0, 0, -d / 2 + pcbD / 2]);
  place(ctx, eye, 'metal', [-w * 0.26, 0, d / 2 - eyeD / 2]);
  place(ctx, eye, 'metal', [w * 0.26, 0, d / 2 - eyeD / 2]);
};

const pcbBoard: PartBuilder = (ctx) => {
  const { width: w, height: h, depth: d } = ctx;

  place(ctx, box(w, h * 0.35, d), 'primary', [0, -h * 0.32, 0]);
  place(ctx, box(w * 0.45, h * 0.65, d * 0.55), 'dark', [0, h * 0.15, 0]);
};

export const BLOCKOUT_BUILDERS: Record<string, PartBuilder> = {
  servo,
  stepper_motor: stepperMotor,
  hinge_joint: hingeJoint,
  linear_actuator: linearActuator,
  l_bracket: lBracket,
  u_bracket: uBracket,
  beam,
  standoff,
  wheel,
  gripper,
  bearing_block: bearingBlock,
  camera_module: cameraModule,
  ultrasonic,
  pcb_board: pcbBoard,
};
