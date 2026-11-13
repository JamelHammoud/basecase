import type { MainModule, MjData, MjModel } from '@mujoco/mujoco';
import * as THREE from 'three';
import { gridPoints, lensDirection } from '../cameras/lens';
import { partCameras } from '../datasets/cameras';
import type { ScenePart } from '../types/robotics';
import type { V3 } from '../utils/kinematics';
import { toMj } from './mjcfFrames';
import type { SimModel } from './mjcfTypes';

export interface Eye {
  part: string;
  body: string;
  pos: V3;
  dirs: number[];
  cols: number;
  rows: number;
  rangeM: number;
}

export interface EyeRequest {
  part: string;
  cols?: number;
  rows?: number;
  rangeM?: number;
}

export const MAX_EYES = 4;
export const MAX_COLS = 32;
export const MAX_ROWS = 24;
export const DEFAULT_COLS = 16;
export const DEFAULT_ROWS = 12;
export const DEFAULT_RANGE_M = 3;
export const MIN_RANGE_M = 0.2;
export const MAX_RANGE_M = 10;
export const EYE_GEOM_GROUPS = [1, 1, 1, 0, 1, 1];

export const eyeRays = (eye: Pick<Eye, 'cols' | 'rows'>) => eye.cols * eye.rows;

export const eyeSize = (eyes: Eye[] | undefined) => (eyes ?? []).reduce((n, e) => n + eyeRays(e), 0);

const dirToMj = (v: THREE.Vector3): V3 => [v.x, -v.z, v.y];

const round = (v: number) => Math.round(v * 1e7) / 1e7;

export function eyeProblems(req: EyeRequest): string[] {
  const out: string[] = [];
  const cols = req.cols ?? DEFAULT_COLS;
  const rows = req.rows ?? DEFAULT_ROWS;
  const range = req.rangeM ?? DEFAULT_RANGE_M;

  if (!Number.isInteger(cols) || cols < 2 || cols > MAX_COLS) out.push(`An eye has 2 to ${MAX_COLS} columns.`);

  if (!Number.isInteger(rows) || rows < 2 || rows > MAX_ROWS) out.push(`An eye has 2 to ${MAX_ROWS} rows.`);

  if (!(range >= MIN_RANGE_M && range <= MAX_RANGE_M)) out.push(`An eye sees ${MIN_RANGE_M} to ${MAX_RANGE_M} m.`);

  return out;
}

export function buildEye(model: SimModel, parts: ScenePart[], req: EyeRequest): Eye | string {
  const part = parts.find((p) => p.id === req.part);
  const body = model.bodies.find((b) => b.parts.includes(req.part));
  const [view] = part ? partCameras([part]) : [];
  const problems = eyeProblems(req);

  if (problems.length) return problems.join(' ');

  if (!part || !view) return `${req.part} isn't a camera with a lens.`;

  if (!body) return `${part.name} isn't on the robot, so it can't be an eye.`;

  const cols = req.cols ?? DEFAULT_COLS;
  const rows = req.rows ?? DEFAULT_ROWS;
  const basis = new THREE.Matrix4().lookAt(
    new THREE.Vector3(...view.position),
    new THREE.Vector3(...view.target),
    new THREE.Vector3(...view.up),
  );
  const dirs = gridPoints(cols, rows).flatMap((point) => {
    const local = lensDirection(view.lens, point, cols / rows);

    return local ? dirToMj(new THREE.Vector3(...local).applyMatrix4(basis).normalize()).map(round) : [0, 0, 0];
  });
  const offset = new THREE.Vector3(...view.position).sub(new THREE.Vector3(...body.origin));

  return {
    part: part.id,
    body: body.name,
    pos: toMj(offset).map(round) as V3,
    dirs,
    cols,
    rows,
    rangeM: req.rangeM ?? DEFAULT_RANGE_M,
  };
}

export interface EyeCaster {
  cast: (out: Float32Array, offset: number) => void;
  dispose: () => void;
}

interface Compact {
  body: number;
  pos: V3;
  index: number[];
  dirs: number[];
  rangeM: number;
  rays: number;
}

function compact(eye: Eye, body: number): Compact {
  const index: number[] = [];
  const dirs: number[] = [];

  for (let i = 0; i < eyeRays(eye); i++) {
    const d = eye.dirs.slice(i * 3, i * 3 + 3);

    if (d[0] === 0 && d[1] === 0 && d[2] === 0) continue;

    index.push(i);
    dirs.push(...d);
  }

  return { body, pos: eye.pos, index, dirs, rangeM: eye.rangeM, rays: eyeRays(eye) };
}

function toWorld(data: MjData, c: Compact): { origin: number[]; dirs: number[] } {
  const p = data.xpos as Float64Array;
  const r = data.xmat as Float64Array;
  const b = c.body;
  const rot = (x: number, y: number, z: number, k: number) =>
    r[b * 9 + k * 3] * x + r[b * 9 + k * 3 + 1] * y + r[b * 9 + k * 3 + 2] * z;
  const origin = [0, 1, 2].map((k) => p[b * 3 + k] + rot(...c.pos, k));
  const dirs: number[] = [];

  for (let i = 0; i < c.dirs.length; i += 3) {
    for (let k = 0; k < 3; k++) dirs.push(rot(c.dirs[i], c.dirs[i + 1], c.dirs[i + 2], k));
  }

  return { origin, dirs };
}

export function eyeCaster(mj: MainModule, model: MjModel, data: MjData, eyes: Eye[]): EyeCaster | string {
  const bodies = eyes.map((e) => mj.mj_name2id(model, mj.mjtObj.mjOBJ_BODY.value, e.body));
  const missing = eyes.find((_, i) => bodies[i] < 0);

  if (missing) return `The eye's body ${missing.body} isn't in this model.`;

  const compacts = eyes.map((e, i) => compact(e, bodies[i]));
  const most = Math.max(1, ...compacts.map((c) => c.index.length));
  const geomid = new mj.IntBuffer(most);
  const dist = new mj.DoubleBuffer(most);

  return {
    cast: (out, offset) => {
      mj.mj_kinematics(model, data);

      let at = offset;

      for (const c of compacts) {
        out.fill(1, at, at + c.rays);

        if (c.index.length) {
          const { origin, dirs } = toWorld(data, c);

          mj.mj_multiRay(
            model,
            data,
            origin,
            dirs,
            EYE_GEOM_GROUPS,
            true,
            c.body,
            geomid,
            dist,
            null,
            c.index.length,
            c.rangeM,
          );

          const seen = dist.GetView() as Float64Array;

          c.index.forEach((ray, k) => {
            const d = seen[k];

            if (d >= 0 && d <= c.rangeM) out[at + ray] = d / c.rangeM;
          });
        }

        at += c.rays;
      }
    },
    dispose: () => {
      geomid.delete();
      dist.delete();
    },
  };
}
