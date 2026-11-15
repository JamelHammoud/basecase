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

function sample(frame: VisionPixels, x: number, y: number, channel: number) {
  const x0 = Math.max(0, Math.min(frame.width - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(frame.height - 1, Math.floor(y)));
  const x1 = Math.min(frame.width - 1, x0 + 1);
  const y1 = Math.min(frame.height - 1, y0 + 1);
  const dx = Math.max(0, x - x0);
  const dy = Math.max(0, y - y0);
  const pixel = (px: number, py: number) => frame.data[(py * frame.width + px) * 4 + channel];

  return (
    pixel(x0, y0) * (1 - dx) * (1 - dy) +
    pixel(x1, y0) * dx * (1 - dy) +
    pixel(x0, y1) * (1 - dx) * dy +
    pixel(x1, y1) * dx * dy
  );
}

function inputPixel(frame: VisionPixels, transform: ImageTransform, pixel: { x: number; y: number; channel: number }) {
  const { x, y, channel } = pixel;
  const px = x - transform.left;
  const py = y - transform.top;

  if (px < 0 || py < 0 || px >= transform.scaledWidth || py >= transform.scaledHeight) return 114;

  return sample(
    frame,
    ((px + 0.5) * frame.width) / transform.scaledWidth - 0.5,
    ((py + 0.5) * frame.height) / transform.scaledHeight - 0.5,
    channel,
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

  for (let i = 0; i < plane * 3; i++) {
    const channel = Math.floor(i / plane);
    const pixel = i % plane;
    const channelIndex = input.color === 'bgr' ? 2 - channel : channel;
    const value = inputPixel(source, transform, {
      x: pixel % size.width,
      y: Math.floor(pixel / size.width),
      channel: channelIndex,
    });

    data[i] = (value * (input.scale ?? 1 / 255) - input.mean[channel]) / input.std[channel];
  }

  return { data, dims: [1, 3, size.height, size.width], transform };
}
