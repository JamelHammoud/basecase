import * as THREE from 'three';
import { eulerToMatrix, type V3 } from '../agent/agentFrame';
import { applySpec, specToPart } from '../agent/agentScene';
import { cadMeshToScene, type AgentCadPayload } from '../agent/cadMesh';
import { planMate } from '../agent/mate';
import type { CadPort } from '../types/cadAudit';
import type { LoopClosure } from '../types/loopClosure';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { fourBarPose, type LinkageSolution, type PlacedFourBar, type Vec2 } from '../utils/linkage';
import type { SketchPlane } from '../utils/sketch/placement';

export const CRANK_SERVO = 'feetech-sts3215';

const BAR = { w: 8, t: 4, pin: 3, gap: 0.2 };
const MECH = 'include <robotics.scad>\ninclude <mechanisms.scad>\n';
const BOX_TRIANGLES = [
  0, 2, 1, 1, 2, 3, 4, 5, 6, 5, 7, 6, 0, 1, 4, 1, 5, 4, 2, 6, 3, 3, 6, 7, 0, 4, 2, 2, 4, 6, 1, 3, 5, 3, 7, 5,
];
const CAD_TO_SCENE = new THREE.Matrix4().makeBasis(
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(0, 0, -1),
  new THREE.Vector3(0, 1, 0),
);
const DEG = 180 / Math.PI;

type BarName = 'ground' | 'crank' | 'coupler' | 'rocker';

export interface LinkageBuild {
  parts: ScenePart[];
  joints: RobotJoint[];
  crankJoint: string;
  coupler: string;
}

const r2 = (v: number) => Math.round(v * 100) / 100 || 0;

interface Pivots {
  a: Vec2;
  b: Vec2;
  c: Vec2;
  d: Vec2;
  p: Vec2;
}

function pivotsAt(l: PlacedFourBar, theta: number): Pivots {
  const pose = fourBarPose(l, theta)!;

  return { a: [0, 0], b: pose.b, c: pose.c, d: [l.ground, 0], p: pose.p };
}

const hasPoint = (l: PlacedFourBar) => l.point[0] !== 0 || l.point[1] !== 0;

function barShape(name: BarName, at: Pivots, l: PlacedFourBar): { points: Vec2[]; z: number } {
  const layer = BAR.t + BAR.gap;
  const shapes: Record<BarName, { points: Vec2[]; z: number }> = {
    ground: { points: [at.a, at.d], z: 0 },
    crank: { points: [at.a, at.b], z: layer },
    rocker: { points: [at.d, at.c], z: layer },
    coupler: { points: hasPoint(l) ? [at.b, at.c, at.p] : [at.b, at.c], z: 2 * layer },
  };

  return shapes[name];
}

function barPorts(name: BarName, at: Pivots, l: PlacedFourBar): CadPort[] {
  const top = 3 * BAR.t + 2 * BAR.gap;
  const port = (portName: string, [x, y]: Vec2, z: number): CadPort => ({
    name: portName,
    position: [r2(x), r2(y), r2(z)],
    axis: [0, 0, z ? 1 : -1],
    kind: 'bore',
    diameterMm: BAR.pin,
  });
  const byBar: Record<BarName, CadPort[]> = {
    ground: [port('A', at.a, 0), port('D', at.d, 0)],
    crank: [port('A', at.a, 0), port('B', at.b, top)],
    rocker: [port('D', at.d, 0), port('C', at.c, top)],
    coupler: [port('B', at.b, top), port('C', at.c, top), ...(hasPoint(l) ? [port('P', at.p, top)] : [])],
  };

  return byBar[name];
}

export function linkageCode(l: PlacedFourBar, theta: number, part: BarName): string {
  const args = [l.ground, l.crank, l.coupler, l.rocker].map(r2).join(', ');

  return `${MECH}four_bar(${args}, theta = ${r2(theta)}, px = ${r2(l.point[0])}, py = ${r2(l.point[1])}, part = "${part}");`;
}

function barCad(name: BarName, l: PlacedFourBar, theta: number): AgentCadPayload {
  const at = pivotsAt(l, theta);
  const { points, z } = barShape(name, at, l);
  const half = BAR.w / 2;
  const min = [Math.min(...points.map((p) => p[0])) - half, Math.min(...points.map((p) => p[1])) - half, z];
  const max = [Math.max(...points.map((p) => p[0])) + half, Math.max(...points.map((p) => p[1])) + half, z + BAR.t];
  const corners = [0, 1, 2, 3, 4, 5, 6, 7].flatMap((k) =>
    [k & 1 ? max[0] : min[0], k & 2 ? max[1] : min[1], k & 4 ? max[2] : min[2]].map(r2),
  );

  return {
    language: 'openscad',
    code: linkageCode(l, theta, name),
    positions: corners,
    indices: BOX_TRIANGLES,
    ports: barPorts(name, at, l),
  };
}

interface Frame {
  origin: THREE.Vector3;
  basis: THREE.Matrix4;
}

function frameOn(plane: SketchPlane, l: PlacedFourBar): Frame {
  const u = new THREE.Vector3(...plane.u);
  const v = new THREE.Vector3(...plane.v);
  const n = u.clone().cross(v).normalize();
  const a = (l.angle * Math.PI) / 180;
  const x = u.clone().multiplyScalar(Math.cos(a)).addScaledVector(v, Math.sin(a));
  const y = u.clone().multiplyScalar(-Math.sin(a)).addScaledVector(v, Math.cos(a));
  const origin = new THREE.Vector3(...plane.origin).addScaledVector(u, l.origin[0]).addScaledVector(v, l.origin[1]);

  return { origin, basis: new THREE.Matrix4().makeBasis(x, y, n) };
}

const toWorld = (frame: Frame, [x, y]: Vec2): V3 =>
  new THREE.Vector3(x, y, 0).applyMatrix4(frame.basis).add(frame.origin).toArray() as V3;

function sceneRotation(frame: Frame): V3 {
  const e = new THREE.Euler().setFromRotationMatrix(frame.basis.clone().multiply(CAD_TO_SCENE.clone().invert()), 'XYZ');

  return [e.x * DEG, e.y * DEG, e.z * DEG];
}

function barPart(id: string, name: BarName, frame: Frame, cad: AgentCadPayload): ScenePart {
  const rotation = sceneRotation(frame);
  const center = new THREE.Vector3(...cadMeshToScene(cad).center).applyMatrix4(eulerToMatrix(rotation));
  const part = specToPart({ id, name: TITLES[name], shape: 'cad_part', material: 'printed', cad });

  return {
    ...part,
    rotation,
    position: center.add(frame.origin).toArray() as V3,
    cad: { ...part.cad!, pending: true },
  };
}

const TITLES: Record<BarName, string> = { ground: 'Ground', crank: 'Crank', coupler: 'Coupler', rocker: 'Rocker' };

function servoOn(parts: ScenePart[], servoId: string, groundId: string): ScenePart {
  const servo = specToPart({ id: servoId, catalog: `component:${CRANK_SERVO}` });
  const plan = planMate([...parts, servo], {
    part: servoId,
    port: 'output',
    target: groundId,
    targetPort: 'A',
    type: 'coaxial',
  });

  return typeof plan === 'string' || plan.op.op !== 'update' ? servo : applySpec(servo, plan.op.part);
}

function depthBelow(part: ScenePart, origin: THREE.Vector3, n: THREE.Vector3): number {
  const m = eulerToMatrix(part.rotation);
  const { width, height, depth } = part.dimensions;
  let lowest = 0;

  for (let k = 0; k < 8; k++) {
    const corner = new THREE.Vector3(
      k & 1 ? width / 2 : -width / 2,
      k & 2 ? height / 2 : -height / 2,
      k & 4 ? depth / 2 : -depth / 2,
    )
      .applyMatrix4(m)
      .add(new THREE.Vector3(...part.position));

    lowest = Math.min(lowest, corner.sub(origin).dot(n));
  }

  return -lowest;
}

const lifted = (v: V3, by: THREE.Vector3): V3 => [v[0] + by.x, v[1] + by.y, v[2] + by.z];

function rounded(l: PlacedFourBar): PlacedFourBar {
  return {
    ...l,
    ground: r2(l.ground),
    crank: r2(l.crank),
    coupler: r2(l.coupler),
    rocker: r2(l.rocker),
    point: [r2(l.point[0]), r2(l.point[1])],
  };
}

function loopJoint(opts: { id: string; name: string; link: LoopClosure['link']; at: V3; axis: V3 }, loop: LoopClosure) {
  return {
    id: opts.id,
    name: opts.name,
    type: 'fixed' as const,
    origin: opts.at,
    axis: opts.axis,
    loop: { ...loop, link: opts.link },
  };
}

export function linkageParts(solution: LinkageSolution, plane: SketchPlane, base: string): LinkageBuild {
  const l = rounded(solution.linkage);
  const [from, to] = solution.crank.map(r2);
  const frame = frameOn(plane, l);
  const n = new THREE.Vector3(0, 0, 1).transformDirection(frame.basis);
  const group = { id: base, name: 'Four-Bar' };
  const ids = {
    ground: `${base}-ground`,
    crank: `${base}-crank`,
    coupler: `${base}-coupler`,
    rocker: `${base}-rocker`,
  };
  const bars = (Object.keys(ids) as BarName[]).map((name) => ({
    ...barPart(ids[name], name, frame, barCad(name, l, from)),
    group,
  }));
  const servo = { ...servoOn(bars, `${base}-servo`, ids.ground), group };
  const lift = n.clone().multiplyScalar(depthBelow(servo, frame.origin, n));
  const parts = [...bars, servo].map((p) => ({ ...p, position: lifted(p.position, lift) }));
  const at = pivotsAt(l, from);
  const world = (p: Vec2) => lifted(toWorld(frame, p), lift);
  const axis = n.toArray() as V3;
  const crankJoint = `${base}-crank-joint`;
  const sweep = r2(to - from);
  const loop: LoopClosure = {
    driver: crankJoint,
    link: 'coupler',
    fourBar: { ground: l.ground, crank: l.crank, coupler: l.coupler, rocker: l.rocker, theta: from },
  };
  const joints: RobotJoint[] = [
    {
      id: crankJoint,
      name: TITLES.crank,
      type: 'revolute',
      parent: [ids.ground, servo.id],
      child: [ids.crank],
      origin: world(at.a),
      axis,
      range: [Math.min(0, sweep), Math.max(0, sweep)],
      actuators: [servo.id],
    },
    {
      ...loopJoint({ id: `${base}-coupler-joint`, name: TITLES.coupler, link: 'coupler', at: world(at.b), axis }, loop),
      parent: [ids.crank],
      child: [ids.coupler],
      parentJoint: crankJoint,
    },
    {
      ...loopJoint({ id: `${base}-rocker-joint`, name: TITLES.rocker, link: 'rocker', at: world(at.d), axis }, loop),
      parent: [ids.ground],
      child: [ids.rocker],
    },
  ];

  return { parts, joints, crankJoint, coupler: ids.coupler };
}
