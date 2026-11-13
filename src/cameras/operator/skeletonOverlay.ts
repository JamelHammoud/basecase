import { POSE } from './poseLandmarks';
import type { SkeletonPoint } from './poseProtocol';

const BONES: Array<[number, number]> = [
  [POSE.leftShoulder, POSE.rightShoulder],
  [POSE.leftShoulder, POSE.leftElbow],
  [POSE.leftElbow, POSE.leftWrist],
  [POSE.rightShoulder, POSE.rightElbow],
  [POSE.rightElbow, POSE.rightWrist],
  [POSE.leftShoulder, POSE.leftHip],
  [POSE.rightShoulder, POSE.rightHip],
  [POSE.leftHip, POSE.rightHip],
];

const ACCENT = '#0d99ff';
const LINE_PX = 2;

export interface Cover {
  width: number;
  height: number;
  dx: number;
  dy: number;
}

export function coverFit(box: { width: number; height: number }, source: { width: number; height: number }): Cover {
  const width = source.width || box.width;
  const height = source.height || box.height;
  const scale = Math.max(box.width / width, box.height / height);

  return {
    width: width * scale,
    height: height * scale,
    dx: (box.width - width * scale) / 2,
    dy: (box.height - height * scale) / 2,
  };
}

export const bonesOf = (points: SkeletonPoint[]) =>
  BONES.flatMap(([a, b]) => (points[a]?.[2] && points[b]?.[2] ? [[points[a], points[b]] as const] : []));

function sizeCanvas(canvas: HTMLCanvasElement) {
  const ratio = window.devicePixelRatio || 1;
  const width = Math.round(canvas.clientWidth * ratio);
  const height = Math.round(canvas.clientHeight * ratio);

  if (canvas.width !== width) canvas.width = width;

  if (canvas.height !== height) canvas.height = height;

  return ratio;
}

export function drawSkeleton(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement | null,
  points: SkeletonPoint[] | null,
) {
  const ctx = canvas.getContext('2d');

  if (!ctx) return;

  const ratio = sizeCanvas(canvas);

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!points) return;

  const fit = coverFit(canvas, { width: video?.videoWidth ?? 0, height: video?.videoHeight ?? 0 });
  const at = (p: SkeletonPoint) => [fit.dx + p[0] * fit.width, fit.dy + p[1] * fit.height] as const;

  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = LINE_PX * ratio;
  ctx.lineCap = 'round';
  ctx.beginPath();

  for (const [from, to] of bonesOf(points)) {
    ctx.moveTo(...at(from));
    ctx.lineTo(...at(to));
  }

  ctx.stroke();
}
