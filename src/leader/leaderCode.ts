import * as THREE from 'three';
import type { AgentCadPayload } from '../agent/cadMesh';
import { LINK_REACH, LINK_WEB, type LinkStep } from './leaderFrames';

const INC = 'include <robotics.scad>\n';
const U_LINK = `servo_u_link(XL330, reach = ${LINK_REACH}, web = ${LINK_WEB}, mount = false, m = 2);`;
const DEG = 180 / Math.PI;

const GRIP = { from: 25.5, length: 90, side: 24 };
const U_LINK_MID_Z = -11.5;
const LEVER = { length: 40, width: 18, thick: 6 };

export const TRIGGER_AT = new THREE.Vector3(100, 0, U_LINK_MID_Z);
export const TRIGGER_RISE = 13;

type Box = [THREE.Vector3, THREE.Vector3];

const box = (min: [number, number, number], max: [number, number, number]): Box => [
  new THREE.Vector3(...min),
  new THREE.Vector3(...max),
];

const U_LINK_BOX = box([-13, -13, -29], [LINK_REACH + LINK_WEB, 13, 6]);
const HORN_LINK_BOX = box([-13, -13, -16.6], [LINK_REACH + LINK_WEB, 13, 6]);
const CRADLE_BOX = box([-29.2, -18.8, -26], [12.75, 18.8, 0.9]);
const BASE_BOX = box([-33.75, -30, -36], [46.25, 30, 0.9]);
const GRIP_BOX = box(
  [GRIP.from, -GRIP.side / 2, U_LINK_MID_Z - GRIP.side / 2],
  [GRIP.from + GRIP.length, GRIP.side / 2, U_LINK_MID_Z + GRIP.side / 2],
);
const LEVER_BOX = box(
  [LINK_REACH + LINK_WEB, -LEVER.width / 2, -LEVER.thick],
  [LINK_REACH + LINK_WEB + LEVER.length, LEVER.width / 2, 0],
);

const r2 = (v: number) => {
  const x = Math.round(v * 100) / 100;

  return Object.is(x, -0) ? 0 : x;
};

const vec = (v: THREE.Vector3) => `[${[v.x, v.y, v.z].map(r2).join(', ')}]`;

export function stepMatrix(link: LinkStep): THREE.Matrix4 {
  return new THREE.Matrix4()
    .makeTranslation(link.length, 0, 0)
    .multiply(new THREE.Matrix4().makeRotationX(link.twist / DEG));
}

function scadRotation(m: THREE.Matrix4): string {
  const e = new THREE.Euler().setFromRotationMatrix(m, 'ZYX');

  return vec(new THREE.Vector3(e.x * DEG, e.y * DEG, e.z * DEG));
}

function corners([min, max]: Box, m?: THREE.Matrix4): THREE.Vector3[] {
  return [0, 1, 2, 3, 4, 5, 6, 7].map((k) => {
    const p = new THREE.Vector3(k & 1 ? max.x : min.x, k & 2 ? max.y : min.y, k & 4 ? max.z : min.z);

    return m ? p.applyMatrix4(m) : p;
  });
}

const BOX_TRIANGLES = [
  0, 2, 1, 1, 2, 3, 4, 5, 6, 5, 7, 6, 0, 1, 4, 1, 5, 4, 2, 6, 3, 3, 6, 7, 0, 4, 2, 2, 4, 6, 1, 3, 5, 3, 7, 5,
];

function placeholder(code: string, points: THREE.Vector3[]): AgentCadPayload {
  const bounds = new THREE.Box3().setFromPoints(points);
  const hull = corners([bounds.min, bounds.max]);

  return {
    language: 'openscad',
    code,
    positions: hull.flatMap((p) => [r2(p.x), r2(p.y), r2(p.z)]),
    indices: BOX_TRIANGLES,
  };
}

export const baseCad = () => placeholder(`${INC}servo_base(XL330, plate = [80, 60, 5], m = 2);`, corners(BASE_BOX));

export function linkCad(link: LinkStep): AgentCadPayload {
  const code = `${INC}servo_link(${r2(link.length)}, ${r2(link.twist)}, s = XL330, reach = ${LINK_REACH}, web = ${LINK_WEB}, m = 2);`;

  return placeholder(code, [...corners(U_LINK_BOX), ...corners(CRADLE_BOX, stepMatrix(link))]);
}

export function handleCad(trigger: THREE.Matrix4 | null): AgentCadPayload {
  const grip = `placed([${GRIP.from + GRIP.length / 2}, 0, ${U_LINK_MID_Z - GRIP.side / 2}]) printed_block([${GRIP.length}, ${GRIP.side}, ${GRIP.side}], r = 6, top = 3);`;
  const points = [...corners(U_LINK_BOX), ...corners(GRIP_BOX), ...(trigger ? corners(CRADLE_BOX, trigger) : [])];

  if (!trigger) return placeholder(`${INC}${U_LINK}\n${grip}`, points);

  const at = `${vec(new THREE.Vector3().setFromMatrixPosition(trigger))}, ${scadRotation(trigger)}`;
  const body = `difference() {\n  ${grip}\n  placed(${at}) servo_pocket(XL330);\n  placed(${at}) translate([0, 0, -23]) cylinder(d = 17, h = 8, center = true);\n}\nplaced(${at}, "trigger_") servo_cradle(XL330, m = 2);`;

  return placeholder(`${INC}${U_LINK}\n${body}`, points);
}

export function triggerCad(): AgentCadPayload {
  const link = `servo_u_link(XL330, reach = ${LINK_REACH}, web = ${LINK_WEB}, part = "horn", mount = false, m = 2);`;
  const lever = `placed([${LEVER_BOX[0].x + LEVER.length / 2}, 0, ${-LEVER.thick}]) printed_block([${LEVER.length}, ${LEVER.width}, ${LEVER.thick}], r = 3, top = 1);`;

  return placeholder(`${INC}${link}\n${lever}`, [...corners(HORN_LINK_BOX), ...corners(LEVER_BOX)]);
}
