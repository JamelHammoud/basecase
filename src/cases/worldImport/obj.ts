import { Color, SRGBColorSpace } from 'three';
import type { WorldMaterial, WorldMesh } from '../worldImportTypes';
import { refuse } from '../validate';
import { DEFAULT_MATERIAL, finite, MAX_WORLD_TRIANGLES, MAX_WORLD_VERTICES, resource } from './limits';
import { readWorldImage } from './image';
import { triangulatePolygon } from './polygon';

interface ObjState {
  points: number[][];
  colors: number[][];
  texcoords: number[][];
  positions: number[];
  colorOut: number[];
  uvs: number[];
  indices: number[];
  groups: WorldMesh['groups'];
  materials: WorldMaterial[];
  material: number;
}

function objIndex(text: string, length: number): number {
  const n = Number(text);
  const index = n < 0 ? length + n : n - 1;

  return Number.isSafeInteger(n) && index >= 0 && index < length
    ? index
    : refuse('OBJ', 'has an out-of-range face index');
}

function vertex(token: string, state: ObjState): number {
  const [p, uv] = token.split('/');
  const index = objIndex(p, state.points.length);
  const next = state.positions.length / 3;

  if (next >= MAX_WORLD_VERTICES) return refuse('World', 'exceeds the vertex limit');

  state.positions.push(...state.points[index]);
  state.colorOut.push(...(state.colors[index] ?? [1, 1, 1]));
  state.uvs.push(...(uv ? state.texcoords[objIndex(uv, state.texcoords.length)] : [0, 0]));

  return next;
}

function face(tokens: string[], state: ObjState) {
  if (tokens.length < 3 || tokens.length > 1024 || state.indices.length / 3 + tokens.length - 2 > MAX_WORLD_TRIANGLES)
    return refuse('World', 'exceeds the triangle limit');

  const vertices = tokens.map((token) => vertex(token, state));
  const triangles = triangulatePolygon(
    tokens.map((token) => state.points[objIndex(token.split('/')[0], state.points.length)]),
  );
  const start = state.indices.length;

  for (const [a, b, c] of triangles) state.indices.push(vertices[a], vertices[b], vertices[c]);

  const previous = state.groups.at(-1);

  if (previous?.material === state.material) previous.count += state.indices.length - start;
  else state.groups.push({ start, count: state.indices.length - start, material: state.material });
}

function numbers(tokens: string[], size: number): number[] {
  if (tokens.length < size) return refuse('OBJ', 'has an incomplete vertex');

  return tokens.slice(0, size).map((n) => finite(Number(n)));
}

function linearColor(tokens: string[]): number[] {
  const [r, g, b] = numbers(tokens, 3);

  if ([r, g, b].some((n) => n < 0 || n > 1)) return refuse('OBJ color', 'must be within 0 and 1');

  return new Color().setRGB(r, g, b, SRGBColorSpace).toArray();
}

function readMaterials(text: string, context: { name: string; files: Map<string, Uint8Array> }): WorldMaterial[] {
  const materials: WorldMaterial[] = [];

  for (const line of text.split(/\r?\n/)) {
    const [key, ...tokens] = line.trim().split(/\s+/);

    if (key === 'newmtl') materials.push({ ...DEFAULT_MATERIAL, name: tokens.join(' ') });

    if (key === 'Kd' && materials.length)
      materials.at(-1)!.color = [...linearColor(tokens), 1] as WorldMaterial['color'];

    if (materials.length > 128) return refuse('World', 'has too many materials');

    if (key === 'map_Kd' && materials.length)
      materials.at(-1)!.image = readWorldImage(resource(tokens.join(' '), context), true);

    if (key === 'map_Kd' && tokens.some((t) => t.startsWith('-')))
      return refuse('OBJ', 'uses unsupported texture options');
  }

  return materials;
}

function parseLine(line: string, state: ObjState, context: { name: string; files: Map<string, Uint8Array> }) {
  const [key, ...tokens] = line.trim().split(/\s+/);

  if (key === 'v') {
    state.points.push(numbers(tokens, 3));
    state.colors.push(tokens.length >= 6 ? linearColor(tokens.slice(3)) : [1, 1, 1]);
  }

  if (key === 'vt') state.texcoords.push(numbers(tokens, 2));

  if (key === 'f') face(tokens, state);

  if (key === 'mtllib') {
    const name = tokens.join(' ');
    const parent = context.name.includes('/') ? context.name.slice(0, context.name.lastIndexOf('/') + 1) : '';

    state.materials.push(
      ...readMaterials(new TextDecoder().decode(resource(name, context)), { ...context, name: parent + name }),
    );
  }

  if (key === 'usemtl') state.material = state.materials.findIndex((m) => m.name === tokens.join(' '));

  if (state.material < 0) return refuse('OBJ', 'names a missing material');

  if (state.materials.length > 128 || state.groups.length > 4096)
    return refuse('OBJ', 'has too many materials or groups');

  if (state.points.length > MAX_WORLD_VERTICES || state.texcoords.length > MAX_WORLD_VERTICES)
    return refuse('World', 'exceeds the vertex limit');
}

export function readObj(bytes: Uint8Array, context: { name: string; files: Map<string, Uint8Array> }): WorldMesh {
  const state: ObjState = {
    points: [],
    colors: [],
    texcoords: [],
    positions: [],
    colorOut: [],
    uvs: [],
    indices: [],
    groups: [],
    materials: [{ ...DEFAULT_MATERIAL }],
    material: 0,
  };

  for (const line of new TextDecoder().decode(bytes).split(/\r?\n/)) parseLine(line, state, context);

  return {
    positions: new Float32Array(state.positions),
    indices: new Uint32Array(state.indices),
    colors: new Float32Array(state.colorOut),
    uvs: new Float32Array(state.uvs),
    groups: state.groups,
    materials: state.materials,
    normals: new Float32Array(),
    bounds: { min: [0, 0, 0], max: [0, 0, 0] },
  };
}
