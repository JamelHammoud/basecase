import type { DroppedFile } from './worldTypes';
import {
  damaged,
  MAX_WORLD_TRIANGLES,
  MAX_WORLD_VERTICES,
  notANumber,
  tooManyTriangles,
  withCommas,
  worldRefuse,
  type RawMesh,
} from './worldRead';

interface ObjState {
  name: string;
  positions: number[];
  indices: number[];
}

const SPACES = /\s+/;

function vertex(state: ObjState, words: string[]) {
  const xyz = words.slice(1, 4).map(Number);

  if (xyz.length < 3 || !xyz.every(Number.isFinite)) notANumber(state.name);

  if (state.positions.length / 3 >= MAX_WORLD_VERTICES) {
    worldRefuse(`${state.name} has over ${withCommas(MAX_WORLD_VERTICES)} vertices.`);
  }

  state.positions.push(...xyz);
}

function corner(state: ObjState, word: string): number {
  const n = Number(word.split('/')[0]);
  const vertices = state.positions.length / 3;
  const index = n < 0 ? vertices + n : n - 1;

  return Number.isInteger(n) && n !== 0 && index >= 0 ? index : damaged(state.name);
}

function face(state: ObjState, words: string[]) {
  const corners = words.slice(1).map((w) => corner(state, w));

  for (let k = 1; k + 1 < corners.length; k++) state.indices.push(corners[0], corners[k], corners[k + 1]);

  if (state.indices.length / 3 > MAX_WORLD_TRIANGLES) tooManyTriangles(state.name);
}

function readLine(state: ObjState, line: string) {
  const words = line.trim().split(SPACES);

  if (words[0] === 'v') vertex(state, words);
  else if (words[0] === 'f') face(state, words);
}

export function readObj(file: DroppedFile): RawMesh {
  const text = new TextDecoder().decode(file.bytes);
  const state: ObjState = { name: file.name, positions: [], indices: [] };

  for (let start = 0; start < text.length;) {
    const end = text.indexOf('\n', start);
    const stop = end < 0 ? text.length : end;

    readLine(state, text.slice(start, stop));
    start = stop + 1;
  }

  const vertices = state.positions.length / 3;

  if (state.indices.some((i) => i >= vertices)) damaged(file.name);

  return { positions: Float32Array.from(state.positions), indices: Uint32Array.from(state.indices) };
}
