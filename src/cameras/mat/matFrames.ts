import type { CaseMat } from '../../cases/mat/matLayout';
import { lensDirection, type Lens } from '../lens';
import type { BaseFix, V3 } from './matSolve';
import { TAG_BORDER_CELLS, TAG_CELLS, tagCells, type FloorPoint } from './tag36h11';

export interface MatCamera {
  position: V3;
  target: V3;
  lens: Lens;
  rollDeg?: number;
}

export interface MatShot {
  mat: CaseMat;
  camera: MatCamera;
  width: number;
  height: number;
  base: BaseFix | null;
  printScale?: number;
  seed?: number;
}

const PAPER = 222;
const INK = 38;
const FLOOR = 74;
const NOISE = 6;
const SUPER = 2;
const KEY_STRIDE = 4096;

interface Square {
  cells: Uint8Array;
  cell: number;
  half: number;
  center: FloorPoint;
  up: FloorPoint;
}

const squareOf = (id: number, center: FloorPoint, size: number, up: FloorPoint): Square => {
  const cell = size / TAG_BORDER_CELLS;

  return { cells: tagCells(id), cell, half: (cell * TAG_CELLS) / 2, center, up };
};

function shade(square: Square, x: number, z: number): number | null {
  const dx = x - square.center[0];
  const dz = z - square.center[1];
  const [ux, uz] = square.up;
  const across = -dx * uz + dz * ux;
  const along = dx * ux + dz * uz;
  const col = Math.floor((across + square.half) / square.cell);
  const row = Math.floor((square.half - along) / square.cell);

  if (col < 0 || row < 0 || col >= TAG_CELLS || row >= TAG_CELLS) return null;

  return square.cells[row * TAG_CELLS + col] ? INK : PAPER;
}

interface Floor {
  sheets: Map<number, { center: FloorPoint; square: Square | null }>;
  left: number;
  bottom: number;
  width: number;
  height: number;
  scale: number;
}

function floorOf(mat: CaseMat, scale: number): Floor {
  const left = Math.min(...mat.sheets.map((s) => s.x0));
  const bottom = Math.min(...mat.sheets.map((s) => s.z0));
  const { width, height } = mat.sheets[0];
  const sheets = new Map<number, { center: FloorPoint; square: Square | null }>();

  for (const sheet of mat.sheets) {
    const center: FloorPoint = [sheet.x0 + width / 2, sheet.z0 + height / 2];
    const tag = mat.tags.find((t) => Math.abs(t.center[0] - center[0]) < 1 && Math.abs(t.center[1] - center[1]) < 1);
    const key = Math.round((sheet.x0 - left) / width) * KEY_STRIDE + Math.round((sheet.z0 - bottom) / height);

    sheets.set(key, { center, square: tag ? squareOf(tag.id, tag.center, tag.size, [0, 1]) : null });
  }

  return { sheets, left, bottom, width, height, scale };
}

function floorShade(floor: Floor, x: number, z: number): number {
  const column = Math.floor((x - floor.left) / floor.width);
  const row = Math.floor((z - floor.bottom) / floor.height);
  const found = column >= 0 && row >= 0 ? floor.sheets.get(column * KEY_STRIDE + row) : undefined;

  if (!found) return FLOOR;

  if (!found.square) return PAPER;

  const [cx, cz] = found.center;

  return shade(found.square, cx + (x - cx) / floor.scale, cz + (z - cz) / floor.scale) ?? PAPER;
}

interface Scene {
  floor: Floor;
  base: Square | null;
  baseHeight: number;
  from: V3;
}

function placedBase(mat: CaseMat, base: BaseFix | null, scale: number): Square | null {
  if (!base) return null;

  return squareOf(mat.base.id, [base.x, base.z], mat.base.size * scale, [Math.sin(base.yaw), Math.cos(base.yaw)]);
}

function sample(scene: Scene, dx: number, dy: number, dz: number): number {
  const { from, base } = scene;
  const atBase = base ? (scene.baseHeight - from[1]) / dy : -1;
  const onBase = base && atBase > 0 ? shade(base, from[0] + dx * atBase, from[2] + dz * atBase) : null;

  if (onBase !== null) return onBase;

  const along = -from[1] / dy;

  return along > 0 ? floorShade(scene.floor, from[0] + dx * along, from[2] + dz * along) : FLOOR;
}

const unit = (v: V3): V3 => {
  const n = Math.hypot(...v);

  return [v[0] / n, v[1] / n, v[2] / n];
};

const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function cameraAxes(camera: MatCamera): { right: V3; up: V3; forward: V3 } {
  const forward = unit(camera.target.map((v, i) => v - camera.position[i]) as V3);
  const flatRight = unit(cross(forward, [0, 1, 0]));
  const flatUp = cross(flatRight, forward);
  const roll = ((camera.rollDeg ?? 0) * Math.PI) / 180;
  const [c, s] = [Math.cos(roll), Math.sin(roll)];

  return {
    forward,
    right: flatRight.map((v, i) => v * c + flatUp[i] * s) as V3,
    up: flatUp.map((v, i) => v * c - flatRight[i] * s) as V3,
  };
}

const noiseAt = (i: number, seed: number) => {
  const h = Math.imul(i ^ Math.imul(seed + 1, 0x9e3779b1), 0x85ebca6b) >>> 0;

  return (((h ^ (h >>> 13)) >>> 0) % 1000) / 1000 - 0.5;
};

function lensRay(lens: Lens, aspect: number): (u: number, v: number, out: Float64Array) => void {
  if (lens.model === 'fisheye') {
    return (u, v, out) => out.set(lensDirection(lens, [u, v], aspect) ?? [0, 0, 1]);
  }

  const t = Math.tan((lens.hfovDeg * Math.PI) / 360);

  return (u, v, out) => {
    out[0] = u * t;
    out[1] = (v * t) / aspect;
    out[2] = -1;
  };
}

interface Grid {
  shadeAt: (gx: number, gy: number) => number;
  width: number;
}

function shadeGrid(shot: MatShot, scene: Scene): Grid {
  const { width, height, camera } = shot;
  const { right, up, forward } = cameraAxes(camera);
  const ray = lensRay(camera.lens, width / height);
  const dir = new Float64Array(3);

  return {
    width,
    shadeAt: (gx, gy) => {
      ray((gx / width) * 2 - 1, 1 - (gy / height) * 2, dir);

      const [x, y, z] = dir;

      return sample(
        scene,
        right[0] * x + up[0] * y - forward[0] * z,
        right[1] * x + up[1] * y - forward[1] * z,
        right[2] * x + up[2] * y - forward[2] * z,
      );
    },
  };
}

function cornerRow(grid: Grid, gy: number): Uint8Array {
  const row = new Uint8Array(grid.width + 1);

  for (let gx = 0; gx <= grid.width; gx++) row[gx] = grid.shadeAt(gx, gy);

  return row;
}

function pixelShade(grid: Grid, corners: [Uint8Array, Uint8Array], px: number, py: number): number {
  const [top, bottom] = corners;
  const a = top[px];

  if (a === top[px + 1] && a === bottom[px] && a === bottom[px + 1]) return a;

  let sum = 0;

  for (let k = 0; k < SUPER * SUPER; k++) {
    sum += grid.shadeAt(px + ((k % SUPER) + 0.5) / SUPER, py + (Math.floor(k / SUPER) + 0.5) / SUPER);
  }

  return sum / (SUPER * SUPER);
}

export function renderMatFrame(shot: MatShot): Uint8Array {
  const { width, height } = shot;
  const scale = shot.printScale ?? 1;
  const grid = shadeGrid(shot, {
    floor: floorOf(shot.mat, scale),
    base: placedBase(shot.mat, shot.base, scale),
    baseHeight: shot.mat.base.center[1],
    from: shot.camera.position,
  });
  const out = new Uint8Array(width * height);
  let top = cornerRow(grid, 0);

  for (let py = 0; py < height; py++) {
    const bottom = cornerRow(grid, py + 1);

    for (let px = 0; px < width; px++) {
      const value = pixelShade(grid, [top, bottom], px, py) + noiseAt(py * width + px, shot.seed ?? 0) * NOISE;

      out[py * width + px] = Math.max(0, Math.min(255, Math.round(value)));
    }

    top = bottom;
  }

  return out;
}
