import { reply } from '../utils/workerRpc';
import { depthBytes, readDepth } from './imageBytes';
import {
  validateFrameSet,
  validateTrainingFrame,
  validateTrainingFrameHeader,
  validateFrameSetHeader,
  validateFrameSplits,
  frameSetHash,
  type FrameSet,
  type ImageClass,
  type TrainingFrame,
} from './frameSet';
import {
  checkedFrameId,
  manifestOf,
  type FrameBytes,
  type FrameSetManifest,
  type FrameSetSummary,
} from './frameSetStoreTypes';

export const frameStoreJobs = {
  hash: async (set: FrameSet) => reply(await frameSetHash(set)),
  manifest: (set: FrameSet) => {
    validateFrameSet(set);

    return reply(manifestOf(set));
  },
  pack: (depth: Float32Array) => reply(depthBytes(depth)),
  packFrame: ({ frame, classes }: { frame: TrainingFrame; classes: ImageClass[] }) => {
    validateTrainingFrame(frame, classes);

    return reply({ jpeg: frame.jpeg, depth: depthBytes(frame.depth) });
  },
  header: (manifest: FrameSetManifest) => {
    validateFrameSetHeader(manifest);
    checkedFrameManifest(manifest);

    return reply(manifest);
  },
  summary: (summary: FrameSetSummary) => {
    validateFrameSetHeader(summary);
    checkedFrameId(summary.id);

    if (!Number.isInteger(summary.frames) || summary.frames < 0 || summary.frames > 10_000)
      throw new Error('Check the image manifest.');

    return reply(summary);
  },
  unpack: (bytes: FrameBytes) => reply({ jpeg: bytes.jpeg, depth: readDepth(bytes.depth) }),
  validate: (set: FrameSet) => {
    validateFrameSet(set);

    return reply(true);
  },
  validateFrame: ({ frame, classes }: { frame: TrainingFrame; classes: ImageClass[] }) => {
    validateTrainingFrame(frame, classes);

    return reply(true);
  },
};

function checkedFrameManifest(manifest: FrameSetManifest) {
  if (
    !Array.isArray(manifest.frames) ||
    manifest.frames.length > 10_000 ||
    new TextEncoder().encode(JSON.stringify(manifest)).length > 16 * 1024 * 1024
  )
    throw new Error('Check the image manifest.');

  const ids = new Set<string>();

  for (const frame of manifest.frames) {
    validateTrainingFrameHeader(frame);
    checkedFrameId(frame.id);

    if (ids.has(frame.id) || 'jpeg' in frame || 'depth' in frame) throw new Error('Check the image id.');

    ids.add(frame.id);
  }

  validateFrameSplits(manifest);
}
