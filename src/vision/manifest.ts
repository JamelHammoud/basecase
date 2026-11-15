export type VisionKind = 'detect' | 'segment' | 'keypoints' | 'classify' | 'depth';
export type VisionAdapter = 'rfdetr' | 'yolo' | 'yunet' | 'depth' | 'generic';

export interface VisionModelFile {
  owner: string;
  repo: string;
  revision: string;
  file: string;
  sha256: string;
  bytes: number;
}

export interface LocalVisionModelFile {
  source: 'local';
  sha256: string;
  bytes: number;
}

export type VisionArtifact = VisionModelFile | LocalVisionModelFile;

export interface VisionManifest {
  version: 1;
  id: string;
  kind: VisionKind;
  adapter: VisionAdapter;
  classes: string[];
  input: {
    width: number;
    height: number;
    layout: 'nchw';
    mean: number[];
    std: number[];
    color?: 'rgb' | 'bgr';
    resize?: 'stretch' | 'letterbox' | 'aspect';
    scale?: number;
  };
  model: VisionArtifact;
}

export const VISION_MODEL_BYTES = 256 * 1024 * 1024;

const NAME = /^(?!.*(?:--|\.\.))[A-Za-z0-9](?:[A-Za-z0-9._-]{0,94}[A-Za-z0-9])?$/;
const SEGMENT = /^(?!\.{1,2}$)[A-Za-z0-9._-]{1,128}$/;
const KINDS = new Set(['detect', 'segment', 'keypoints', 'classify', 'depth']);
const ADAPTERS = new Set(['rfdetr', 'yolo', 'yunet', 'depth', 'generic']);
const triple = (v: unknown, positive = false): v is number[] =>
  Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(n) && (!positive || n > 0));
const dimension = (v: unknown) => Number.isInteger(v) && Number(v) > 0 && Number(v) <= 2048;

function modelPath(file: unknown): file is string {
  return (
    typeof file === 'string' &&
    file.length <= 300 &&
    file.endsWith('.onnx') &&
    file.split('/').every((p) => SEGMENT.test(p))
  );
}

function modelNames(v: Partial<VisionModelFile> | null): v is VisionModelFile {
  return !!v && typeof v.owner === 'string' && typeof v.repo === 'string' && NAME.test(v.owner) && NAME.test(v.repo);
}

export function validateVisionModelFile(value: unknown): VisionModelFile {
  const v = value as Partial<VisionModelFile> | null;

  if (!modelNames(v) || 'source' in v) throw new Error('Choose a Hugging Face model repo.');

  if (!/^[a-f0-9]{40}$/.test(v.revision ?? '')) throw new Error('The model needs a pinned commit.');

  if (!/^[a-f0-9]{64}$/.test(v.sha256 ?? '')) throw new Error('The model needs a SHA256 hash.');

  if (!Number.isInteger(v.bytes) || v.bytes < 1 || v.bytes > VISION_MODEL_BYTES)
    throw new Error('The model exceeds the download limit.');

  if (!modelPath(v.file)) throw new Error('Choose an ONNX file inside the model repo.');

  return { owner: v.owner, repo: v.repo, revision: v.revision, file: v.file, sha256: v.sha256, bytes: v.bytes };
}

export function validateVisionArtifact(value: unknown): VisionArtifact {
  const v = value as Partial<LocalVisionModelFile> | null;

  if (!v || !('source' in v)) return validateVisionModelFile(value);

  if (v.source !== 'local' || Object.keys(v).some((key) => !['source', 'sha256', 'bytes'].includes(key)))
    throw new Error('Choose a retained local model.');

  if (typeof v.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(v.sha256))
    throw new Error('The model needs a SHA256 hash.');

  if (!Number.isInteger(v.bytes) || !v.bytes || v.bytes < 1 || v.bytes > VISION_MODEL_BYTES)
    throw new Error('The model exceeds the download limit.');

  return { source: 'local', sha256: v.sha256, bytes: v.bytes };
}

function checkedInput(input: VisionManifest['input'] | undefined): asserts input is VisionManifest['input'] {
  if (
    !input ||
    !dimension(input.width) ||
    !dimension(input.height) ||
    input.layout !== 'nchw' ||
    !triple(input.mean) ||
    !triple(input.std, true)
  )
    throw new Error('The model needs bounded image dimensions and normalization.');

  checkInputOptions(input);
}

function checkInputOptions(input: VisionManifest['input']) {
  if (input.color !== undefined && !['rgb', 'bgr'].includes(input.color)) throw new Error('Choose RGB or BGR input.');

  if (input.resize !== undefined && !['stretch', 'letterbox', 'aspect'].includes(input.resize))
    throw new Error('Choose a supported image resize.');

  if (input.scale !== undefined && (!Number.isFinite(input.scale) || input.scale <= 0))
    throw new Error('Choose a positive pixel scale.');
}

function checkedClasses(classes: unknown): asserts classes is string[] {
  if (!Array.isArray(classes) || classes.length > 10000 || classes.some((c) => typeof c !== 'string' || c.length > 100))
    throw new Error('The model needs a bounded class list.');
}

const ADAPTER_KINDS: Record<VisionAdapter, VisionKind[]> = {
  generic: ['detect', 'segment', 'keypoints', 'classify', 'depth'],
  rfdetr: ['detect'],
  yolo: ['detect'],
  yunet: ['detect', 'keypoints'],
  depth: ['depth'],
};

function checkedAdapter(adapter: VisionAdapter, kind: VisionKind) {
  if (!ADAPTER_KINDS[adapter].includes(kind)) throw new Error('Choose an adapter for this vision task.');
}

export function validateVisionManifest(value: unknown): VisionManifest {
  const v = value as Partial<VisionManifest> | null;
  const input = v?.input;

  if (
    !v ||
    v.version !== 1 ||
    typeof v.id !== 'string' ||
    !SEGMENT.test(v.id) ||
    !KINDS.has(v.kind!) ||
    !ADAPTERS.has(v.adapter!)
  )
    throw new Error('Choose a supported vision manifest.');

  checkedAdapter(v.adapter!, v.kind!);
  checkedInput(input);
  checkedClasses(v.classes);

  return {
    ...v,
    input: { ...input, mean: [...input.mean], std: [...input.std] },
    classes: [...v.classes],
    model: validateVisionArtifact(v.model),
  } as VisionManifest;
}
