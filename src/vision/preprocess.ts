import type { VisionModelManifest } from './manifest';
import type { RgbaFrame } from './protocol';

export interface FrameTransform {
  width: number;
  height: number;
  resizedWidth: number;
  resizedHeight: number;
  offsetX: number;
  offsetY: number;
  inputWidth: number;
  inputHeight: number;
}

export function frameTransform(frame: Pick<RgbaFrame, 'width' | 'height'>, model: VisionModelManifest): FrameTransform {
  const [inputWidth, inputHeight] = model.inputSize;
  const scale = Math.min(inputWidth / frame.width, inputHeight / frame.height);
  const resizedWidth = model.resize === 'stretch' ? inputWidth : Math.round(frame.width * scale);
  const resizedHeight = model.resize === 'stretch' ? inputHeight : Math.round(frame.height * scale);

  return {
    ...frame,
    inputWidth,
    inputHeight,
    resizedWidth,
    resizedHeight,
    offsetX: Math.floor((inputWidth - resizedWidth) / 2),
    offsetY: Math.floor((inputHeight - resizedHeight) / 2),
  };
}

function bilinear(frame: RgbaFrame, x: number, y: number, channel: number): number {
  const boundedX = Math.max(0, Math.min(frame.width - 1, x));
  const boundedY = Math.max(0, Math.min(frame.height - 1, y));
  const x0 = Math.floor(boundedX);
  const y0 = Math.floor(boundedY);
  const x1 = Math.min(x0 + 1, frame.width - 1);
  const y1 = Math.min(y0 + 1, frame.height - 1);
  const dx = boundedX - x0;
  const dy = boundedY - y0;
  const at = (px: number, py: number) => frame.data[(py * frame.width + px) * 4 + channel];

  return (at(x0, y0) * (1 - dx) + at(x1, y0) * dx) * (1 - dy) + (at(x0, y1) * (1 - dx) + at(x1, y1) * dx) * dy;
}

function pixel(frame: RgbaFrame, transform: FrameTransform, index: number, channel: number): number {
  const x = (index % transform.inputWidth) - transform.offsetX;
  const y = Math.floor(index / transform.inputWidth) - transform.offsetY;

  if (x < 0 || y < 0 || x >= transform.resizedWidth || y >= transform.resizedHeight) return 114;

  return bilinear(
    frame,
    ((x + 0.5) * frame.width) / transform.resizedWidth - 0.5,
    ((y + 0.5) * frame.height) / transform.resizedHeight - 0.5,
    channel,
  );
}

export function prepareFrame(frame: RgbaFrame, model: VisionModelManifest) {
  if (
    !Number.isInteger(frame.width) ||
    !Number.isInteger(frame.height) ||
    frame.width < 1 ||
    frame.height < 1 ||
    frame.width * frame.height > 16_777_216 ||
    frame.data.length !== frame.width * frame.height * 4
  )
    throw new Error('Camera frame couldn’t be read.');

  const transform = frameTransform({ width: frame.width, height: frame.height }, model);
  const plane = transform.inputWidth * transform.inputHeight;
  const data = new Float32Array(plane * 3);
  const mean = [0.485, 0.456, 0.406];
  const std = [0.229, 0.224, 0.225];

  for (let index = 0; index < data.length; index++) {
    const channel = Math.floor(index / plane);
    const sourceChannel = model.normalization === 'bgr' ? 2 - channel : channel;
    const value = pixel(frame, transform, index % plane, sourceChannel);
    const unit = value / 255;

    data[index] = model.normalization === 'bgr' ? value : unit;

    if (model.normalization === 'imagenet') data[index] = (unit - mean[channel]) / std[channel];
  }

  return { data, dims: [1, 3, transform.inputHeight, transform.inputWidth], transform };
}

export function sourceBox(box: readonly number[], transform: FrameTransform): [number, number, number, number] {
  const x = Math.max(0, Math.min(1, (box[0] - transform.offsetX) / transform.resizedWidth));
  const y = Math.max(0, Math.min(1, (box[1] - transform.offsetY) / transform.resizedHeight));
  const right = Math.max(0, Math.min(1, (box[0] + box[2] - transform.offsetX) / transform.resizedWidth));
  const bottom = Math.max(0, Math.min(1, (box[1] + box[3] - transform.offsetY) / transform.resizedHeight));

  return [x, y, Math.max(0, right - x), Math.max(0, bottom - y)];
}
