import { lastAtOrBefore } from '../../dataLayers/track';
import type { RecordedTopic } from '../../topics/topicLog';
import { schemaKey } from '../../topics/schemas';
import { imageDimensions, decodeSourceImage } from '../../vision/import/imageDecode';
import type { ComparisonSource, SamplingRule } from './comparison';
import { openTryVideo, type TryVideoDecoder } from '../../vision/tryFrameMedia';
import { recordedVideoTime } from '../../cameras/recordedFrames';

const SIZE = 512;
const FORMATS: Readonly<Record<string, number>> = { rgb8: 3, bgr8: 3, rgba8: 4, bgra8: 4, mono8: 1 };

export interface ComparisonImageFrame {
  bytes: Uint8Array | Float64Array;
  encoding: string;
  width: number;
  height: number;
  step: number;
  at: number;
  key: string;
}

export function comparisonImageFrame(
  source: ComparisonSource,
  camera: string,
  time: number,
  rule: SamplingRule,
): ComparisonImageFrame | null {
  const topic = source.index.topics.find((candidate) => candidate.topic === camera);
  const i = topic ? lastAtOrBefore(topic.t, time) : -1;

  if (!topic || i < 0 || !Number.isFinite(time) || time > source.end || time - topic.t[i] > rule.maxAge) return null;

  return frameFromTopic(topic, i, source.hash);
}

function frameFromTopic(topic: RecordedTopic, i: number, hash: string): ComparisonImageFrame | null {
  const data = topic.blobs.get('data') ?? topic.lists.get('data');

  if (!data || data.at[i] === data.at[i + 1]) return null;

  const all = 'bytes' in data ? data.bytes : data.v;
  const bytes = all.subarray(data.at[i], data.at[i + 1]);
  const compressed = schemaKey(topic.schema) === 'sensor_msgs/CompressedImage';

  return {
    bytes,
    encoding: compressed ? 'compressed' : (topic.labels.get('encoding')?.[i] ?? ''),
    width: topic.numbers.get('width')?.[i] ?? 0,
    height: topic.numbers.get('height')?.[i] ?? 0,
    step: topic.numbers.get('step')?.[i] ?? 0,
    at: topic.t[i],
    key: `${hash}:${topic.topic}:${i}`,
  };
}

function checkedPixels(bytes: Uint8Array | Float64Array) {
  if (bytes instanceof Uint8Array) return bytes;

  for (const value of bytes) {
    if (!Number.isInteger(value) || value < 0 || value > 255) throw new Error('Couldn’t read the camera image.');
  }

  return bytes;
}

export function rawComparisonPixels(frame: ComparisonImageFrame) {
  const { width, height, encoding, bytes } = frame;

  imageDimensions(width, height);
  checkedPixels(bytes);

  const channels = FORMATS[encoding];
  const step = frame.step || width * channels;

  if (!channels || step < width * channels || bytes.length < height * step)
    throw new Error('Couldn’t read the camera image.');

  const scale = Math.min(1, SIZE / width, SIZE / height);
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const pixels = new Uint8ClampedArray(w * h * 4);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const at = Math.floor(y / scale) * step + Math.floor(x / scale) * channels;
      const out = (y * w + x) * 4;
      const bgr = encoding.startsWith('bgr');

      pixels[out] = bytes[at + (bgr ? 2 : 0)];
      pixels[out + 1] = bytes[at + Math.min(1, channels - 1)];
      pixels[out + 2] = bytes[at + (bgr ? 0 : Math.min(2, channels - 1))];
      pixels[out + 3] = channels === 4 ? bytes[at + 3] : 255;
    }
  }

  return { pixels, width: w, height: h };
}

async function imageBitmap(frame: ComparisonImageFrame) {
  if (frame.encoding === 'compressed') {
    const decoded = await decodeSourceImage(Uint8Array.from(checkedPixels(frame.bytes)), new Map());
    const scale = Math.min(1, SIZE / decoded.width, SIZE / decoded.height);

    return createImageBitmap(new Blob([Uint8Array.from(decoded.jpeg)]), {
      resizeWidth: Math.max(1, Math.round(decoded.width * scale)),
      resizeHeight: Math.max(1, Math.round(decoded.height * scale)),
    });
  }

  const raw = rawComparisonPixels(frame);
  const canvas = new OffscreenCanvas(raw.width, raw.height);
  const context = canvas.getContext('2d');

  if (!context) throw new Error('Couldn’t read the camera image.');

  context.putImageData(new ImageData(raw.pixels, raw.width, raw.height), 0, 0);

  const bitmap = canvas.transferToImageBitmap();

  canvas.width = 1;

  return bitmap;
}

function missingImage(source: ComparisonSource, camera: string, time: number, rule: SamplingRule) {
  if (time < source.start || time > source.end) return 'Outside range';

  const topic = source.index.topics.find((candidate) => candidate.topic === camera);
  const i = topic ? lastAtOrBefore(topic.t, time) : -1;

  if (topic?.clipped && time > (topic.t.at(-1) ?? source.end)) return 'Clipped';

  return topic && i >= 0 && time - topic.t[i] > rule.maxAge ? 'Stale sample' : 'Missing sample';
}

export function comparisonImageSession() {
  let kept: ImageBitmap | null = null;
  let key = '';
  let video: TryVideoDecoder | null = null;
  let videoKey = '';
  const clearBitmap = () => {
    kept?.close();
    kept = null;
    key = '';
  };
  const close = () => {
    clearBitmap();
    video?.close();
    video = null;
    videoKey = '';
  };
  const readVideo = async (source: ComparisonSource, camera: string, time: number) => {
    const clip = source.stored.videos?.find(
      (candidate) => candidate.camera === camera && !/\.(mcap|bag)$/iu.test(candidate.path),
    );

    if (!clip || recordedVideoTime(clip, source.stored.source, time) === null) return null;

    const identity = `${source.hash}:${camera}`;

    if (videoKey !== identity) {
      close();
      video = await openTryVideo(source.stored, clip);
      videoKey = identity;
    }

    const frame = await video!.frame(time);

    return {
      bytes: frame.jpeg,
      encoding: 'compressed',
      width: frame.width,
      height: frame.height,
      step: 0,
      at: time,
      key: `${identity}:${time}`,
    };
  };

  return {
    close,
    async read(source: ComparisonSource, camera: string, time: number, rule: SamplingRule) {
      const frame = comparisonImageFrame(source, camera, time, rule) ?? (await readVideo(source, camera, time));

      if (!frame) {
        clearBitmap();

        return { bitmap: null, at: null, bytes: 0, missing: missingImage(source, camera, time, rule) };
      }

      if (key !== frame.key) {
        clearBitmap();
        kept = await imageBitmap(frame);
        key = frame.key;
      }

      const bitmap = await createImageBitmap(kept!);

      return { bitmap, at: frame.at, bytes: bitmap.width * bitmap.height * 4, missing: null };
    },
  };
}
