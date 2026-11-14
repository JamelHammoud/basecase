import { Matrix4, Quaternion, Vector3 } from 'three';
import type { WorldMaterial, WorldMesh } from '../worldImportTypes';
import { refuse, vector } from '../validate';
import { accessor, bufferView, gltfContext, type GltfContext } from './gltfAccessors';
import { readWorldImage } from './image';
import {
  DEFAULT_MATERIAL,
  finite,
  integer,
  item,
  list,
  MAX_WORLD_TRIANGLES,
  MAX_WORLD_VERTICES,
  record,
  resource,
} from './limits';

function affineMatrix(value: unknown): Matrix4 {
  const matrix = vector(16)(value, 'glTF matrix');

  if (matrix[3] !== 0 || matrix[7] !== 0 || matrix[11] !== 0 || matrix[15] !== 1)
    return refuse('glTF', 'needs affine node transforms');

  return new Matrix4().fromArray(matrix);
}

function nodeMatrix(node: Record<string, unknown>): Matrix4 {
  if (node.matrix !== undefined) return affineMatrix(node.matrix);

  const translation = vector(3)(node.translation ?? [0, 0, 0], 'glTF translation');
  const rotation = vector(4)(node.rotation ?? [0, 0, 0, 1], 'glTF rotation');
  const scale = vector(3)(node.scale ?? [1, 1, 1], 'glTF scale');
  const quaternion = new Quaternion().fromArray(rotation);

  if (Math.abs(quaternion.length() - 1) > 1e-4 || scale.some((v) => v === 0))
    return refuse('glTF', 'has a broken node transform');

  return new Matrix4().compose(new Vector3().fromArray(translation), quaternion, new Vector3().fromArray(scale));
}

function textureWrap(value: unknown): NonNullable<WorldMaterial['image']>['wrapS'] {
  const modes = { 10497: 'repeat', 33071: 'clamp', 33648: 'mirror' } as const;

  return modes[integer(value ?? 10497) as keyof typeof modes] ?? refuse('glTF', 'has an unsupported texture sampler');
}

function imageFor(
  material: Record<string, unknown>,
  context: GltfContext,
  files: { name: string; files: Map<string, Uint8Array> },
): WorldMaterial['image'] {
  if (material.baseColorTexture === undefined) return undefined;

  const textureInfo = record(material.baseColorTexture);

  if (textureInfo.texCoord !== undefined && textureInfo.texCoord !== 0)
    return refuse('glTF', 'needs the first texture coordinate set');

  if (textureInfo.extensions !== undefined) return refuse('glTF', 'uses unsupported texture transforms');

  const texture = item(context.document.textures, textureInfo.index);
  const image = item(context.document.images, texture.source);
  const bytes = image.uri === undefined ? bufferView(image.bufferView, context) : resource(image.uri, files);
  const result = readWorldImage(bytes, false);
  const sampler = texture.sampler === undefined ? {} : item(context.document.samplers, texture.sampler);

  result.wrapS = textureWrap(sampler.wrapS);
  result.wrapT = textureWrap(sampler.wrapT);

  if (image.mimeType !== undefined && image.mimeType !== result.mimeType)
    return refuse('glTF', 'has a mismatched texture type');

  return result;
}

function materials(context: GltfContext, files: { name: string; files: Map<string, Uint8Array> }): WorldMaterial[] {
  const values = list(context.document.materials ?? [], 128).map((value) => {
    const material = record(value);
    const pbr = record(material.pbrMetallicRoughness ?? {});
    const color = vector(4)(pbr.baseColorFactor ?? [1, 1, 1, 1], 'glTF color') as WorldMaterial['color'];
    const roughness = finite(pbr.roughnessFactor ?? 1);
    const metalness = finite(pbr.metallicFactor ?? 1);

    if ([...color, roughness, metalness].some((n) => n < 0 || n > 1))
      return refuse('glTF', 'has an out-of-range material');

    return {
      name: typeof material.name === 'string' ? material.name.slice(0, 80) : 'World',
      color,
      roughness,
      metalness,
      image: imageFor(pbr, context, files),
      doubleSided: material.doubleSided === true,
    };
  });

  return [...values, { ...DEFAULT_MATERIAL }];
}

interface MeshState {
  positions: number[];
  indices: number[];
  colors: number[];
  uvs: number[];
  groups: WorldMesh['groups'];
  materials: WorldMaterial[];
}

function vertexAttributes(attributes: Record<string, unknown>, context: GltfContext, count: number) {
  const colorAccessor =
    attributes.COLOR_0 === undefined ? undefined : item(context.document.accessors, attributes.COLOR_0);
  const colorSize = colorAccessor?.type === 'VEC4' ? 4 : 3;
  const colors = colorAccessor ? accessor(attributes.COLOR_0, context, colorSize) : Array(count * 3).fill(1);
  const uvs =
    attributes.TEXCOORD_0 === undefined ? Array(count * 2).fill(0) : accessor(attributes.TEXCOORD_0, context, 2);

  if (colors.length / colorSize !== count || uvs.length / 2 !== count)
    return refuse('glTF', 'has mismatched vertex attributes');

  return { colors, colorSize, uvs };
}

function primitive(value: unknown, matrix: Matrix4, context: GltfContext, state: MeshState) {
  const p = record(value);
  const attributes = record(p.attributes);

  if ((p.mode ?? 4) !== 4 || p.targets !== undefined || p.extensions !== undefined)
    return refuse('glTF', 'needs uncompressed triangle meshes');

  const positions = accessor(attributes.POSITION, context, 3);
  const indices =
    p.indices === undefined
      ? Array.from({ length: positions.length / 3 }, (_, i) => i)
      : accessor(p.indices, context, 1);
  const offset = state.positions.length / 3;
  const material =
    p.material === undefined ? state.materials.length - 1 : integer(p.material, state.materials.length - 2);

  if (
    indices.length % 3 ||
    state.indices.length + indices.length > MAX_WORLD_TRIANGLES * 3 ||
    offset + positions.length / 3 > MAX_WORLD_VERTICES
  )
    return refuse('World', 'exceeds the triangle or vertex limit');

  if (indices.some((i) => !Number.isSafeInteger(i) || i < 0 || i >= positions.length / 3))
    return refuse('glTF', 'has an out-of-range triangle index');

  const { colors, colorSize, uvs } = vertexAttributes(attributes, context, positions.length / 3);

  appendPrimitive({ positions, indices, colors, colorSize, uvs, material }, matrix, state);
}

function appendPrimitive(
  data: {
    positions: number[];
    indices: number[];
    colors: number[];
    colorSize: number;
    uvs: number[];
    material: number;
  },
  matrix: Matrix4,
  state: MeshState,
) {
  const { positions, indices, colors, colorSize, uvs, material } = data;
  const offset = state.positions.length / 3;
  const point = new Vector3();

  for (let i = 0; i < positions.length; i += 3) {
    point.fromArray(positions, i).applyMatrix4(matrix);
    state.positions.push(...point.toArray());
    state.colors.push(...colors.slice((i / 3) * colorSize, (i / 3) * colorSize + 3));
  }

  state.groups.push({ start: state.indices.length, count: indices.length, material });

  const reflected = matrix.determinant() < 0;

  for (let i = 0; i < indices.length; i += 3)
    state.indices.push(
      indices[i] + offset,
      indices[i + (reflected ? 2 : 1)] + offset,
      indices[i + (reflected ? 1 : 2)] + offset,
    );

  for (const uv of uvs) state.uvs.push(uv);
}

function traverse(index: unknown, parent: Matrix4, context: GltfContext, job: { state: MeshState; seen: Set<number> }) {
  const { state, seen } = job;
  const id = integer(index, 4095);

  if (seen.has(id) || seen.size >= 256) return refuse('glTF', 'has repeated or excessive scene nodes');

  seen.add(id);

  const node = item(context.document.nodes, id);
  const matrix = parent.clone().multiply(nodeMatrix(node));

  if (node.skin !== undefined || Math.abs(matrix.determinant()) < 1e-12)
    return refuse('glTF', 'needs rigid node transforms');

  const primitives = node.mesh === undefined ? [] : list(item(context.document.meshes, node.mesh).primitives, 1024);

  for (const value of primitives) primitive(value, matrix, context, state);

  for (const child of list(node.children ?? [], 256)) traverse(child, matrix, context, job);
}

export function readGltf(bytes: Uint8Array, files: { name: string; files: Map<string, Uint8Array> }): WorldMesh {
  const context = gltfContext(bytes, files);
  const state: MeshState = {
    positions: [],
    indices: [],
    colors: [],
    uvs: [],
    groups: [],
    materials: materials(context, files),
  };
  const scene = item(context.document.scenes, context.document.scene ?? 0);
  const seen = new Set<number>();

  for (const node of list(scene.nodes, 256)) traverse(node, new Matrix4(), context, { state, seen });

  if (state.groups.length > 4096) return refuse('glTF', 'has too many mesh groups');

  return {
    positions: new Float32Array(state.positions),
    indices: new Uint32Array(state.indices),
    colors: new Float32Array(state.colors),
    uvs: new Float32Array(state.uvs),
    groups: state.groups,
    materials: state.materials,
    normals: new Float32Array(),
    bounds: { min: [0, 0, 0], max: [0, 0, 0] },
  };
}
