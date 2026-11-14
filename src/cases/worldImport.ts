import { CaseFileError } from './validate';
import { boxOf, floorHeight, horizontalSide, isUpsideDown, largestSide, MM_PER_M, mmPerUnit } from './worldFrame';
import { gltfBox, gltfFiles, readGltf } from './worldGltf';
import { readObj } from './worldObj';
import { allFinite, checkWorldSizes, concatenated, fileExtension, worldRefuse, type RawMesh } from './worldRead';
import { isSplatPly, readSplatPly } from './worldSplat';
import { readSpz } from './worldSpz';
import type { DroppedFile, MeshFormat, SplatFormat, WorldFrame, WorldLook, WorldSource } from './worldTypes';

export {
  checkWorldSizes,
  MAX_SPLAT_POINTS,
  MAX_WORLD_DROP_BYTES,
  MAX_WORLD_FILE_BYTES,
  MAX_WORLD_TRIANGLES,
} from './worldRead';
export { floorHeight, isUpsideDown, mmPerUnit } from './worldFrame';

export const MIN_WORLD_SIDE_MM = 2 * MM_PER_M;

const MESH_FORMATS: MeshFormat[] = ['glb', 'gltf', 'obj'];
const GLTF_FORMATS: MeshFormat[] = ['glb', 'gltf'];

const meshFormatOf = (file: DroppedFile) => {
  const ext = fileExtension(file.name) as MeshFormat;

  return MESH_FORMATS.includes(ext) ? ext : undefined;
};

export function splatFormatOf(file: DroppedFile): SplatFormat | undefined {
  const ext = fileExtension(file.name);

  if (ext === 'spz') return 'spz';

  return ext === 'ply' && isSplatPly(file.bytes) ? 'ply' : undefined;
}

const isGltf = (file: DroppedFile) => GLTF_FORMATS.includes(meshFormatOf(file)!);

function quietly<T>(read: () => T, fallback: T): T {
  try {
    return read();
  } catch {
    return fallback;
  }
}

function isWorldSized(file: DroppedFile, files: DroppedFile[]) {
  if (!isGltf(file)) return false;

  const box = quietly(() => gltfBox(file, files), null);

  return !!box && horizontalSide(box) * mmPerUnit(largestSide(box)) >= MIN_WORLD_SIDE_MM;
}

export function worldFilesOf(files: DroppedFile[]): DroppedFile[] {
  const splats = files.filter((f) => splatFormatOf(f));
  const meshes = files.filter((f) => meshFormatOf(f) && (splats.length || isWorldSized(f, files)));
  const linked = meshes.filter(isGltf).flatMap((m) => quietly(() => gltfFiles(m, files), []));

  return files.filter((f) => splats.includes(f) || meshes.includes(f) || linked.includes(f.name));
}

const worldName = (fileName: string) =>
  fileName
    .replace(/\.[^.]*$/, '')
    .trim()
    .slice(0, 60) || 'World';

function turnOverX(positions: Float32Array) {
  for (let i = 0; i < positions.length; i += 3) {
    positions[i + 1] = -positions[i + 1];
    positions[i + 2] = -positions[i + 2];
  }
}

function levelled(mesh: RawMesh, name: string): { positions: Float32Array; frame: WorldFrame } {
  if (!mesh.indices.length) worldRefuse(`${name} holds no triangles.`);

  const unit = mmPerUnit(largestSide(boxOf(mesh.positions)));
  const positions = mesh.positions.map((v) => v * unit);

  if (!allFinite(positions)) worldRefuse(`${name} has a vertex that isn’t a number.`);

  const flip = isUpsideDown(positions, mesh.indices);

  if (flip) turnOverX(positions);

  const floor = floorHeight(positions, mesh.indices) ?? boxOf(positions).min[1];
  const liftMm = -floor;

  for (let i = 1; i < positions.length; i += 3) positions[i] += liftMm;

  return { positions, frame: { mmPerUnit: unit, liftMm, ...(flip ? { flip } : {}) } };
}

function readMesh(file: DroppedFile, files: DroppedFile[]): RawMesh & { files: string[] } {
  return isGltf(file) ? readGltf(file, files) : { ...readObj(file), files: [] };
}

async function splatLook(file: DroppedFile): Promise<WorldLook['splat']> {
  const format = splatFormatOf(file)!;
  const points = format === 'spz' ? await readSpz(file) : readSplatPly(file);

  return { file: file.name, format, points };
}

export class MissingCollider extends CaseFileError {}

async function readWorld(files: DroppedFile[]): Promise<WorldSource> {
  const splats = files.filter((f) => splatFormatOf(f));
  const meshes = files.filter((f) => meshFormatOf(f));
  const [splat] = splats;
  const [mesh] = meshes;

  if (splats.length > 1 || meshes.length > 1) worldRefuse('Drop one world at a time.');

  if (splat && !mesh) throw new MissingCollider(`Drop ${splat.name} with its collider mesh.`);

  if (!mesh) worldRefuse('Drop a world mesh or a room scan.');

  const read = readMesh(mesh, files);
  const { positions, frame } = levelled(read, mesh.name);
  const look: WorldLook = { mesh: { file: mesh.name, format: meshFormatOf(mesh)! } };

  if (splat) look.splat = await splatLook(splat);

  const used = new Set([mesh.name, ...read.files, ...(splat ? [splat.name] : [])]);

  return {
    name: worldName(mesh.name),
    files: files.filter((f) => used.has(f.name)),
    look,
    frame,
    positions,
    indices: read.indices,
  };
}

export async function readWorldSource(files: DroppedFile[]): Promise<WorldSource> {
  checkWorldSizes(files.map((f) => ({ name: f.name, byteLength: f.bytes.byteLength })));

  try {
    return await readWorld(files);
  } catch (error) {
    if (error instanceof CaseFileError) throw error;

    throw new CaseFileError('Couldn’t read these files.');
  }
}

const byName = (a: DroppedFile, b: DroppedFile) => Number(a.name > b.name) - Number(a.name < b.name);

const sha256 = async (bytes: Uint8Array) =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource));

export async function worldHash(files: DroppedFile[]): Promise<string> {
  const encoder = new TextEncoder();
  const records = await Promise.all(
    [...files]
      .sort(byName)
      .map(async (f) => [encoder.encode(`${f.name}\n${f.bytes.byteLength}\n`), await sha256(f.bytes)]),
  );
  const joined = concatenated(records.flat(), (n) => new Uint8Array(n));

  return [...(await sha256(joined))].map((b) => b.toString(16).padStart(2, '0')).join('');
}
