import { BONES, type PoseLandmark } from './landmarks';

const ACCENT = '#0d99ff';
const SEEN = 0.5;
const FIT = 0.42;

export function imageFromWorld(world: readonly PoseLandmark[]): PoseLandmark[] {
  const ys = world.map((p) => p.y);
  const span = Math.max(Math.max(...ys) - Math.min(...ys), 0.5);
  const mid = (Math.max(...ys) + Math.min(...ys)) / 2;

  return world.map((p) => ({
    x: 0.5 + (p.x / span) * FIT * 2,
    y: 0.5 + ((p.y - mid) / span) * FIT * 2,
    z: 0,
    visibility: p.visibility,
  }));
}

const shown = (p: PoseLandmark | undefined): p is PoseLandmark => !!p && (p.visibility ?? 1) >= SEEN;

export interface Picture {
  ctx: OffscreenCanvasRenderingContext2D;
  mirror: boolean;
}

export function drawFrame({ ctx, mirror }: Picture, frame: CanvasImageSource) {
  const { width, height } = ctx.canvas;

  ctx.save();

  if (mirror) {
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
  }

  ctx.drawImage(frame, 0, 0, width, height);
  ctx.restore();
}

export function drawSkeleton({ ctx, mirror }: Picture, image: readonly PoseLandmark[]) {
  const { width, height } = ctx.canvas;
  const at = (p: PoseLandmark): [number, number] => [(mirror ? 1 - p.x : p.x) * width, p.y * height];

  ctx.strokeStyle = ACCENT;
  ctx.fillStyle = ACCENT;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';

  for (const [a, b] of BONES) {
    const pa = image[a],
      pb = image[b];

    if (!shown(pa) || !shown(pb)) continue;

    ctx.beginPath();
    ctx.moveTo(...at(pa));
    ctx.lineTo(...at(pb));
    ctx.stroke();
  }

  for (const p of image.slice(11)) {
    if (!shown(p)) continue;

    ctx.beginPath();
    ctx.arc(...at(p), 7, 0, Math.PI * 2);
    ctx.fill();
  }
}
