import * as THREE from 'three';
import type { BaseFix } from '../../cameras/mat/matSolve';
import type { FloorPoint } from '../../cameras/mat/tag36h11';
import { quatToMj, simDeltas, toMj } from '../../sim/mjcfFrames';
import type { SimModel } from '../../sim/mjcfTypes';
import { framePoses, RECORD_HZ, type Recording } from '../../sim/recorder';
import type { Rig } from '../../utils/kinematics';
import type { BaseTag } from './matLayout';

export interface RealSample {
  t: number;
  base: BaseFix | null;
}

export interface RealTrace {
  samples: RealSample[];
  seconds: number;
}

export interface RealScene {
  model: SimModel;
  rig: Rig;
  base: BaseTag;
}

export const MAX_GAP_SECONDS = 0.15;

const turn = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

function seenAround(seen: Array<{ t: number; base: BaseFix }>, t: number): BaseFix | null {
  const after = seen.findIndex((s) => s.t >= t);

  if (after < 0) return null;

  const next = seen[after];

  if (next.t === t || after === 0) return next.t - t <= 1e-9 ? next.base : null;

  const prev = seen[after - 1];
  const span = next.t - prev.t;

  if (span > MAX_GAP_SECONDS) return null;

  const k = (t - prev.t) / span;

  return {
    x: prev.base.x + (next.base.x - prev.base.x) * k,
    z: prev.base.z + (next.base.z - prev.base.z) * k,
    yaw: prev.base.yaw + turn(prev.base.yaw, next.base.yaw) * k,
  };
}

export function resampleBase(trace: RealTrace, dt = 1 / RECORD_HZ): Array<BaseFix | null> {
  const seen = trace.samples.flatMap((s) => (s.base ? [{ t: s.t, base: s.base }] : []));
  const frames = Math.floor(trace.seconds / dt + 1e-9) + 1;

  return Array.from({ length: frames }, (_, i) => seenAround(seen, i * dt));
}

function baseDelta(tag: BaseTag, fix: BaseFix): THREE.Matrix4 {
  const restYaw = Math.atan2(tag.up[0], tag.up[1]);
  const [cx, cy, cz] = tag.center;

  return new THREE.Matrix4()
    .makeTranslation(fix.x, cy, fix.z)
    .multiply(new THREE.Matrix4().makeRotationY(fix.yaw - restYaw))
    .multiply(new THREE.Matrix4().makeTranslation(-cx, -cy, -cz));
}

export function pivotAt(fix: BaseFix, tag: BaseTag, pivot: FloorPoint): FloorPoint {
  const at = new THREE.Vector3(pivot[0], tag.center[1], pivot[1]).applyMatrix4(baseDelta(tag, fix));

  return [at.x, at.z];
}

const REST_QUAT = [1, 0, 0, 0];

function writePose(out: Float32Array, at: number, origin: THREE.Vector3, delta: THREE.Matrix4 | null) {
  if (!delta) return out.fill(NaN, at, at + 7);

  const q = new THREE.Quaternion().setFromRotationMatrix(delta);

  out.set([...toMj(origin.clone().applyMatrix4(delta)), ...quatToMj(q)], at);
}

export function realRecording(trace: RealTrace, scene: RealScene): Recording {
  const { model, rig, base } = scene;
  const dt = 1 / RECORD_HZ;
  const fixes = resampleBase(trace, dt);
  const own = rig.robots[0]?.parts ?? new Set<string>();
  const moves = model.bodies.map((b) => b.parts.some((id) => own.has(id)));
  const origins = model.bodies.map((b) => new THREE.Vector3(...b.origin));
  const nbody = model.bodies.length;
  const poses = new Float32Array(fixes.length * nbody * 7);

  fixes.forEach((fix, i) => {
    const delta = fix && baseDelta(base, fix);

    origins.forEach((origin, b) => {
      const at = (i * nbody + b) * 7;

      if (moves[b]) return writePose(poses, at, origin, delta);

      poses.set([...toMj(origin), ...REST_QUAT], at);
    });
  });

  return {
    dt,
    frames: fixes.length,
    nq: 0,
    nv: 0,
    nu: 0,
    nbody,
    t: Float32Array.from(fixes, (_, i) => i * dt),
    ctrl: new Float32Array(0),
    qpos: new Float64Array(0),
    qvel: new Float32Array(0),
    poses,
    faults: [],
  };
}

export function basePathOf(recording: Recording, scene: { model: SimModel; rig: Rig }): Array<FloorPoint | null> {
  const robot = scene.rig.robots[0];
  const part = [...(robot?.parts ?? [])].find((id) => !scene.rig.ownerOf.has(id));
  const pivot = new THREE.Vector3(...(robot?.pivot ?? [0, 0, 0]));

  return Array.from({ length: recording.frames }, (_, i) => {
    const delta = part ? simDeltas(scene.model, framePoses(recording, i)).get(part) : undefined;
    const at = delta ? pivot.clone().applyMatrix4(delta) : null;

    return at && Number.isFinite(at.x) && Number.isFinite(at.z) ? [at.x, at.z] : null;
  });
}
