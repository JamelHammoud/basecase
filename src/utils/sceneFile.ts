import type { Skill } from '../skills/artifacts';
import { readSkillBundle } from '../skills/bundle';
import type { ProjectSettings, SavedSceneRecord, SceneAnnotation, ScenePart } from '../types/robotics';

export const SCENE_FILE_EXTENSION = 'basecase';

const FORMAT = 'basecase-scene';
const VERSION = 1;
const GZIP_MAGIC = [0x1f, 0x8b];

export interface SharedScene {
  name: string;
  globalGoal: string;
  parts: ScenePart[];
  annotations: SceneAnnotation[];
  project?: ProjectSettings;
  previewDataUrl?: string;
  sizeMm?: [number, number, number];
  skills?: Skill[];
}

interface SceneFile {
  format: typeof FORMAT;
  version: number;
  scene: SharedScene;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isImageData = (value: unknown) => typeof value === 'string' && value.startsWith('data:image/');

const isVec3 = (value: unknown) =>
  Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === 'number' && Number.isFinite(n));

const isPart = (value: unknown): value is ScenePart =>
  isObject(value) && typeof value.id === 'string' && typeof value.kind === 'string' && isVec3(value.position);

function localProject(project: ProjectSettings | undefined): ProjectSettings | undefined {
  if (!isObject(project)) return undefined;

  const rest = { ...project };

  delete rest.prints;
  delete rest.quotes;
  delete rest.madeBy;
  delete rest.policies;
  delete rest.tries;
  delete rest.triesStored;
  delete rest.skills;
  delete rest.buildGuide;

  return rest;
}

function cleanPart(part: ScenePart): ScenePart {
  if (part.imageDataUrl === undefined || isImageData(part.imageDataUrl)) return part;

  const rest = { ...part };

  delete rest.imageDataUrl;

  return rest;
}

export function sharedScene(record: Omit<SavedSceneRecord, 'id' | 'updatedAt' | 'partCount'>): SharedScene {
  return {
    name: record.name,
    globalGoal: record.globalGoal ?? '',
    parts: record.parts,
    annotations: record.annotations ?? [],
    project: localProject(record.project),
    previewDataUrl: record.previewDataUrl,
    sizeMm: record.sizeMm,
  };
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);

  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function encodeSceneFile(scene: SharedScene): Promise<Uint8Array> {
  const file: SceneFile = { format: FORMAT, version: VERSION, scene };

  return pipe(new TextEncoder().encode(JSON.stringify(file)), new CompressionStream('gzip'));
}

async function readJson(bytes: Uint8Array): Promise<unknown> {
  const gzipped = bytes[0] === GZIP_MAGIC[0] && bytes[1] === GZIP_MAGIC[1];
  const raw = gzipped ? await pipe(bytes, new DecompressionStream('gzip')).catch(() => null) : bytes;

  try {
    return raw ? JSON.parse(new TextDecoder().decode(raw)) : null;
  } catch {
    return null;
  }
}

function checkedFile(file: unknown): Record<string, unknown> {
  if (!isObject(file) || file.format !== FORMAT || !isObject(file.scene)) {
    throw new Error('Not a Basecase scene.');
  }

  if (typeof file.version !== 'number' || file.version > VERSION) {
    throw new Error('Made with a newer Basecase. Update to open it.');
  }

  return file.scene;
}

export async function decodeSceneFile(bytes: Uint8Array): Promise<SharedScene> {
  const scene = checkedFile(await readJson(bytes));

  if (!Array.isArray(scene.parts) || !scene.parts.every(isPart)) {
    throw new Error('The scene’s parts are damaged.');
  }

  return {
    name: typeof scene.name === 'string' && scene.name.trim() ? scene.name.trim() : 'Untitled',
    globalGoal: typeof scene.globalGoal === 'string' ? scene.globalGoal : '',
    parts: scene.parts.map(cleanPart),
    annotations: Array.isArray(scene.annotations) ? (scene.annotations as SceneAnnotation[]) : [],
    project: localProject(scene.project as ProjectSettings | undefined),
    previewDataUrl: isImageData(scene.previewDataUrl) ? (scene.previewDataUrl as string) : undefined,
    sizeMm: isVec3(scene.sizeMm) ? (scene.sizeMm as [number, number, number]) : undefined,
    ...(Array.isArray(scene.skills) ? { skills: readSkillBundle(scene.skills) } : {}),
  };
}

export const isSceneFileName = (name: string) => name.toLowerCase().endsWith(`.${SCENE_FILE_EXTENSION}`);
