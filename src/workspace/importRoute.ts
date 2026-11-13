import { SCENE_FILE_EXTENSION } from '../utils/sceneFile';

export const MESH_FILE_EXTENSIONS = ['stl', '3mf', 'obj', 'ply', 'fbx', 'glb', 'gltf', 'dae'];

export const CAD_FILE_EXTENSIONS = ['step', 'stp', 'iges', 'igs'];

export type ImportKind = 'parts' | 'svg' | 'robot' | 'motion' | 'scene' | 'image';

const KIND_EXTENSIONS: Record<ImportKind, string[]> = {
  parts: [...MESH_FILE_EXTENSIONS, ...CAD_FILE_EXTENSIONS],
  svg: ['svg'],
  robot: ['urdf', 'xacro', 'mjcf', 'xml', 'zip'],
  motion: ['bvh'],
  scene: [SCENE_FILE_EXTENSION],
  image: ['png', 'jpg', 'jpeg', 'webp', 'gif'],
};

const KINDS = Object.keys(KIND_EXTENSIONS) as ImportKind[];

export interface ImportOptions {
  cad: boolean;
}

export const extensionOf = (name: string) => {
  const dot = name.lastIndexOf('.');

  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
};

export const isCadFileName = (name: string) => CAD_FILE_EXTENSIONS.includes(extensionOf(name));

export function importKindOf(name: string, { cad }: ImportOptions): ImportKind | null {
  const ext = extensionOf(name);

  if (!cad && CAD_FILE_EXTENSIONS.includes(ext)) return null;

  return KINDS.find((kind) => KIND_EXTENSIONS[kind].includes(ext)) ?? null;
}

export const isImageType = (type: string | undefined) => !!type && /^image\/(?!svg)/.test(type);

interface NamedFile {
  name: string;
  type?: string;
}

const fileKindOf = (file: NamedFile, options: ImportOptions) =>
  importKindOf(file.name, options) ?? (isImageType(file.type) ? 'image' : null);

export type SortedImports<T> = Record<ImportKind | 'unknown', T[]>;

export function sortImports<T extends NamedFile>(files: T[], options: ImportOptions): SortedImports<T> {
  const sorted: SortedImports<T> = { parts: [], svg: [], robot: [], motion: [], scene: [], image: [], unknown: [] };

  for (const file of files) sorted[fileKindOf(file, options) ?? 'unknown'].push(file);

  return sorted;
}

export const couldntImport = (files: { name: string }[]) => `Couldn’t import ${files.map((f) => f.name).join(', ')}`;

export interface ImportHandlers<T> {
  parts: (files: T[]) => void;
  svg: (file: T) => void;
  robot: (files: T[]) => void;
  motion: (file: T) => void;
  scene: (file: T) => void;
  image: (file: T, index: number) => void;
  unknown: (files: T[]) => void;
}

export function routeImports<T extends NamedFile>(files: T[], handlers: ImportHandlers<T>, options: ImportOptions) {
  const sorted = sortImports(files, options);
  const [svg, ...extraSvgs] = sorted.svg;
  const [motion, ...extraMotions] = sorted.motion;
  const unknown = [...extraSvgs, ...extraMotions, ...sorted.unknown];

  if (sorted.parts.length) handlers.parts(sorted.parts);

  if (sorted.robot.length) handlers.robot(sorted.robot);

  if (svg) handlers.svg(svg);

  if (motion) handlers.motion(motion);

  sorted.scene.forEach((file) => handlers.scene(file));
  sorted.image.forEach((file, i) => handlers.image(file, i));

  if (unknown.length) handlers.unknown(unknown);
}

export const importAccept = ({ cad }: ImportOptions) =>
  KINDS.flatMap((kind) => KIND_EXTENSIONS[kind])
    .filter((ext) => cad || !CAD_FILE_EXTENSIONS.includes(ext))
    .map((ext) => `.${ext}`)
    .join(',');
