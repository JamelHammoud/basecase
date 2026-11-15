import type { SourceFolder } from '../../datasets/import/types';
import { importCoco } from '../cocoExport';
import { frameHash, frameSetHash, validateFrameSet, type FrameSet } from '../frameSet';
import { readImagePackage, type ImageFiles } from '../imagePackage';
import { importYolo } from '../yoloExport';
import { imageDimensions } from './imageDecode';
import { cocoManifest, readCoco } from './cocoRead';
import { imageSourceKind } from './imageSourceKind';
import { readImageParquet } from './parquetRead';
import {
  chargeImage,
  IMAGE_LIMITS,
  list,
  name,
  number,
  record,
  sourceBytes,
  sourceFiles,
  sourceJson,
  type ImageSourceFiles,
} from './sourceFiles';
import { readVoc } from './vocRead';
import { readYolo } from './yoloRead';

function canonicalFile(path: string): boolean {
  return /^(?:basecase\/frames\.json|images\/(?:train|val|test)\/[\w-]{1,128}\.jpg|depth\/[\w-]{1,128}\.f32|labels\/(?:train|val|test)\/[\w-]{1,128}\.txt|annotations\/instances_(?:train|validation|test)\.json|data\.yaml)$/.test(
    path,
  );
}

async function canonicalPackage(files: ImageSourceFiles): Promise<FrameSet | null> {
  const manifests = [...files.keys()]
    .filter((path) => /(^|\/)basecase\/frames\.json$/.test(path))
    .sort((a, b) => a.length - b.length || a.localeCompare(b));

  if (!manifests.length) return null;

  const root = manifests[0].slice(0, -'basecase/frames.json'.length);
  const contents: ImageFiles = {};
  const metadata = await sourceJson(files, manifests[0]);

  for (const value of list(metadata.frames, IMAGE_LIMITS.frames)) {
    const frame = record(value);
    const [width, height] = imageDimensions(number(frame.width), number(frame.height));

    chargeImage(files, width, height);
  }

  for (const path of files.keys()) {
    if (!path.startsWith(root) || !canonicalFile(path.slice(root.length))) continue;

    contents[path.slice(root.length)] = await sourceBytes(
      files,
      path,
      path.endsWith('.json') || /\.ya?ml$/.test(path) ? IMAGE_LIMITS.metadata : IMAGE_LIMITS.image,
    );
  }

  if (Object.keys(contents).some(cocoManifest)) return importCoco(contents);

  if ('data.yaml' in contents) return importYolo(contents);

  return readImagePackage(contents);
}

async function identifiedSet(data: Pick<FrameSet, 'frames' | 'classes'>, folder: SourceFolder): Promise<FrameSet> {
  const frames = new Map<string, FrameSet['frames'][number]>();

  for (const frame of data.frames) {
    const imported = { ...frame, source: 'import' as const };
    const id = await frameHash(imported);

    frames.set(id, { ...imported, id });
  }

  const set: FrameSet = {
    version: 1,
    id: 'pending',
    name: name(folder.name.replace(/\.(zip|tar)$/i, '')),
    caseId: null,
    sceneId: null,
    seed: 0,
    classes: data.classes,
    frames: [...frames.values()].sort((a, b) => a.id.localeCompare(b.id)),
    createdAt: '1970-01-01T00:00:00.000Z',
  };

  validateFrameSet(set);
  set.id = await frameSetHash(set);

  return set;
}

export async function readImageSource(folder: SourceFolder): Promise<FrameSet | null> {
  const kind = imageSourceKind(folder.files.map((file) => file.path));

  if (!kind) return null;

  const files = sourceFiles(folder);
  const canonical = await canonicalPackage(files);

  if (canonical) return canonical;

  const readers = { coco: readCoco, yolo: readYolo, voc: readVoc, 'image-parquet': readImageParquet };
  const data = await readers[kind](files);

  return data ? identifiedSet(data, folder) : null;
}
