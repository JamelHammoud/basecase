import { createHash } from 'node:crypto';
import { checkedFileId } from '../backend/constants.mjs';

export const MAX_FRAME_BYTES = 32 * 1024 * 1024;
export const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
export const MAX_FRAMES = 10000;
export const isHash = (value) => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
export function checkedHash(value) {
  checkedFileId(value);

  if (!isHash(value)) throw new Error('A frame needs its content hash.');

  return value;
}
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item ?? null)).join(',')}]`;

  if (value && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a < b ? -1 : 1);

    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }

  return JSON.stringify(value) ?? 'null';
}
export function checkedContent(raw, limit) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > limit) throw new Error('The frame file is too large.');

  const data = JSON.parse(raw);
  const { id, ...content } = data;

  checkedHash(id);

  if (createHash('sha256').update(canonicalJson(content)).digest('hex') !== id) throw new Error('The frame hash differs.');

  return data;
}

const shortText = (value) => typeof value === 'string' && value.length > 0 && value.length <= 2000;

function hasFrameReferences(data) {
  return Number.isSafeInteger(data.seed) && data.seed >= 0 && Array.isArray(data.frames) && data.frames.length > 0 && data.frames.length <= MAX_FRAMES;
}

export function checkedManifest(raw) {
  const data = checkedContent(raw, MAX_MANIFEST_BYTES);

  if (data.format !== 'basecase-vision' || data.version !== 1 || !shortText(data.name) || !shortText(data.caseId)) throw new Error('The frame set needs its metadata.');

  if (!hasFrameReferences(data)) throw new Error('The frame set needs its frames.');

  if (!Array.isArray(data.classes) || data.classes.length > 10000 || !data.classes.every(validClass)) throw new Error('The frame set needs its classes.');

  if (new Set(data.frames).size !== data.frames.length || new Set(data.classes.map((item) => item.id)).size !== data.classes.length) throw new Error('The frame set repeats an id.');

  data.frames.forEach(checkedHash);

  return data;
}

function validClass(value) {
  return value && Number.isSafeInteger(value.id) && value.id >= 0 && shortText(value.name) && shortText(value.kind) && (value.keypoints === undefined || Array.isArray(value.keypoints) && value.keypoints.length <= 10000 && value.keypoints.every(shortText));
}

export function summaryOf(manifest, createdAt) {
  return { id: manifest.id, name: manifest.name, caseId: manifest.caseId, frames: manifest.frames.length, classCount: manifest.classes.length, createdAt };
}
