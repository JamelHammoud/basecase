import { parentPort, workerData } from 'node:worker_threads';
import { checkedContent, MAX_FRAME_BYTES } from './frameSetPolicy.mjs';

try {
  const frame = checkedContent(workerData.data, MAX_FRAME_BYTES);
  const pixels = frame.width * frame.height;

  if (frame.id !== workerData.id || !Number.isSafeInteger(pixels) || pixels < 1 || pixels > 4194304) throw new Error('The frame needs its dimensions.');

  if (typeof frame.image !== 'string' || typeof frame.depth !== 'string' || Buffer.from(frame.depth, 'base64').length !== pixels * 4) throw new Error('The frame needs its image and depth.');

  parentPort.postMessage({ ok: true });
} catch (error) {
  parentPort.postMessage({ error: error.message });
}
