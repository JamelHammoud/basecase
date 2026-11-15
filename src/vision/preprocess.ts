import { depthResize } from './depthResize';
import type { VisionManifest } from './manifest';
import type { VisionPixels } from './types';

export interface ImageTransform {
  width: number;
  height: number;
  scaledWidth: number;
  scaledHeight: number;
  left: number;
  top: number;
}

export function imageTransform(
  frame: { width: number; height: number },
  input: VisionManifest['input'],
): ImageTransform {
  const scale = Math.min(input.width / frame.width, input.height / frame.height);
  const letterbox = input.resize === 'letterbox';
  const scaledWidth = letterbox ? Math.round(frame.width * scale) : input.width;
  const scaledHeight = letterbox ? Math.round(frame.height * scale) : input.height;

  return {
    width: input.width,
    height: input.height,
    scaledWidth,
    scaledHeight,
    left: Math.floor((input.width - scaledWidth) / 2),
    top: Math.floor((input.height - scaledHeight) / 2),
  };
}

interface PixelSample {
  topLeft: number;
  topRight: number;
  bottomLeft: number;
  bottomRight: number;
  dx: number;
  dy: number;
}

function pixelSample(frame: VisionPixels, x: number, y: number): PixelSample {
  const x0 = Math.max(0, Math.min(frame.width - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(frame.height - 1, Math.floor(y)));
  const x1 = Math.min(frame.width - 1, x0 + 1);
  const y1 = Math.min(frame.height - 1, y0 + 1);

  return {
    topLeft: (y0 * frame.width + x0) * 4,
    topRight: (y0 * frame.width + x1) * 4,
    bottomLeft: (y1 * frame.width + x0) * 4,
    bottomRight: (y1 * frame.width + x1) * 4,
    dx: Math.max(0, x - x0),
    dy: Math.max(0, y - y0),
  };
}

function sample(data: Uint8ClampedArray, pixel: PixelSample | null, channel: number) {
  if (!pixel) return 114;

  const { topLeft, topRight, bottomLeft, bottomRight, dx, dy } = pixel;

  return (
    data[topLeft + channel] * (1 - dx) * (1 - dy) +
    data[topRight + channel] * dx * (1 - dy) +
    data[bottomLeft + channel] * (1 - dx) * dy +
    data[bottomRight + channel] * dx * dy
  );
}

function inputSample(frame: VisionPixels, transform: ImageTransform, index: number): PixelSample | null {
  const px = (index % transform.width) - transform.left;
  const py = Math.floor(index / transform.width) - transform.top;

  if (px < 0 || py < 0 || px >= transform.scaledWidth || py >= transform.scaledHeight) return null;

  return pixelSample(
    frame,
    ((px + 0.5) * frame.width) / transform.scaledWidth - 0.5,
    ((py + 0.5) * frame.height) / transform.scaledHeight - 0.5,
  );
}

export function preprocess(frame: VisionPixels, input: VisionManifest['input']) {
  if (
    !Number.isInteger(frame.width) ||
    !Number.isInteger(frame.height) ||
    frame.width < 1 ||
    frame.height < 1 ||
    frame.width * frame.height > 16777216 ||
    frame.data.length !== frame.width * frame.height * 4
  )
    throw new Error('The camera frame has unsupported dimensions.');

  const source = input.resize === 'aspect' ? depthResize(frame, input) : frame;
  const size = input.resize === 'aspect' ? { ...input, width: source.width, height: source.height } : input;
  const transform = imageTransform(source, size);
  const plane = size.width * size.height;
  const data = new Float32Array(plane * 3);

  for (let pixel = 0; pixel < plane; pixel++) {
    const sampling = inputSample(source, transform, pixel);

    for (let channel = 0; channel < 3; channel++) {
      const channelIndex = input.color === 'bgr' ? 2 - channel : channel;
      const value = sample(source.data, sampling, channelIndex);

      data[channel * plane + pixel] = (value * (input.scale ?? 1 / 255) - input.mean[channel]) / input.std[channel];
    }
  }

  return { data, dims: [1, 3, size.height, size.width], transform };
}
