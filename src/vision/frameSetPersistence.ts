import {
  readFrame,
  readFrameSetManifest,
  serializeFrame,
  serializeFrameSetManifest,
  type FrameSetManifest,
  type VisionFrame,
} from './frameSet';
import { reply } from '../utils/workerRpc';

export interface FrameSetSummary {
  id: string;
  name: string;
  caseId: string;
  frames: number;
  classCount: number;
  createdAt: string;
}
export const persistenceHandlers = {
  encodeFrame: (frame: VisionFrame) => {
    const data = serializeFrame(frame);

    if (!readFrame(data)) throw new Error('The frame content differs from its hash.');

    return reply(data);
  },
  decodeFrame: (data: string) => {
    const frame = readFrame(data);

    return reply(frame, frame ? [frame.image.buffer, frame.depth.buffer] : []);
  },
  encodeManifest: (manifest: FrameSetManifest) => {
    const data = serializeFrameSetManifest(manifest);

    if (new TextEncoder().encode(data).length > 2 * 1024 * 1024)
      throw new Error('The frame set manifest is too large.');

    if (!readFrameSetManifest(data)) throw new Error('The frame set content differs from its hash.');

    return reply(data);
  },
  decodeManifest: (data: string) => reply(readFrameSetManifest(data)),
};
