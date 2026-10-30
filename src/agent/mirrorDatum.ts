import * as THREE from 'three';
import type { Port } from '../types/ports';
import type { ScenePart } from '../types/robotics';
import { eulerToMatrix, matrixToEuler, type V3 } from './agentFrame';
import { portsOf } from './ports';

type Axis = 0 | 1 | 2;

export interface MirrorDatum {
  axis: Axis;
  offset: number;
}

const AXIS_WEIGHT = 10;
const TIE_MM = 0.5;

function flipPort(p: Port, j: Axis, c: number): Port {
  const position: V3 = [...p.position];
  const axis: V3 = [...p.axis];

  position[j] = 2 * c - position[j];
  axis[j] = -axis[j];

  return { ...p, position, axis };
}

const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function mismatch(p: Port, ports: Port[]): number {
  const same = ports.filter((q) => q.kind === p.kind && q.thread === p.thread);

  return Math.min(Infinity, ...same.map((q) => dist(p.position, q.position) + AXIS_WEIGHT * dist(p.axis, q.axis)));
}

function planeOffset(ports: Port[], j: Axis): number {
  const output = ports.find((p) => p.kind === 'output' && Math.abs(p.axis[j]) < 0.1);

  if (output) return output.position[j];

  if (!ports.length) return 0;

  const values = ports.map((p) => p.position[j]);

  return (Math.min(...values) + Math.max(...values)) / 2;
}

function symmetryScore(ports: Port[], j: Axis, c: number): number {
  const asymmetry = ports.reduce((s, p) => s + Math.min(100, mismatch(flipPort(p, j, c), ports)), 0);

  return asymmetry + Math.abs(2 * c);
}

export function mirrorDatum(ports: Port[], localMirror: V3): MirrorDatum {
  const candidates = ([0, 1, 2] as Axis[]).map((axis) => {
    const offset = planeOffset(ports, axis);

    return { axis, offset, score: symmetryScore(ports, axis, offset), align: Math.abs(localMirror[axis]) };
  });
  const best = Math.min(...candidates.map((c) => c.score));
  const [pick] = candidates.filter((c) => c.score <= best + TIE_MM).sort((a, b) => b.align - a.align);

  return { axis: pick.axis, offset: pick.offset };
}

export function mirrorByDatum(part: ScenePart, k: Axis): Pick<ScenePart, 'position' | 'rotation'> {
  const S = new THREE.Matrix4().makeScale(k === 0 ? -1 : 1, k === 1 ? -1 : 1, k === 2 ? -1 : 1);
  const R = eulerToMatrix(part.rotation);
  const worldAxis = new THREE.Vector3().setComponent(k, 1);
  const localMirror = worldAxis.applyMatrix4(R.clone().transpose()).toArray() as V3;
  const { axis, offset } = mirrorDatum(portsOf(part), localMirror);
  const F = new THREE.Matrix4().makeScale(axis === 0 ? -1 : 1, axis === 1 ? -1 : 1, axis === 2 ? -1 : 1);
  const turned = S.clone().multiply(R).multiply(F);
  const shift = new THREE.Vector3().setComponent(axis, 2 * offset).applyMatrix4(S.clone().multiply(R));
  const position = new THREE.Vector3(...part.position).applyMatrix4(S).add(shift);

  return {
    position: position.toArray().map((v) => Math.round(v * 1000) / 1000) as V3,
    rotation: matrixToEuler(turned),
  };
}
