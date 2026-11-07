/// <reference lib="webworker" />
import { filmFrames, frameBounds, type FilmstripInput } from './filmstrip';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

const BACKGROUND = '#202020';
const PAD = 10;

function draw(input: FilmstripInput): ImageBitmap {
  const frames = filmFrames(input);
  const canvas = new OffscreenCanvas(input.width * frames.length, input.height);
  const g = canvas.getContext('2d')!;
  const b = frameBounds(frames);
  const scale = Math.min(
    (input.width - PAD * 2) / Math.max(b.maxX - b.minX, 1),
    (input.height - PAD * 2) / Math.max(b.maxY - b.minY, 1),
  );

  g.fillStyle = BACKGROUND;
  g.fillRect(0, 0, canvas.width, canvas.height);

  frames.forEach((frame, k) => {
    const ox = k * input.width + PAD - b.minX * scale;
    const oy = PAD - b.minY * scale;

    for (const poly of frame.polygons) {
      g.beginPath();
      poly.points.forEach(([x, y], i) =>
        i ? g.lineTo(ox + x * scale, oy + y * scale) : g.moveTo(ox + x * scale, oy + y * scale),
      );
      g.closePath();
      g.globalAlpha = poly.world ? 0.55 : 0.9;
      g.fillStyle = poly.color;
      g.fill();
    }

    g.globalAlpha = 1;
  });

  return canvas.transferToImageBitmap();
}

ctx.onmessage = (ev: MessageEvent<{ id: number; input: FilmstripInput }>) => {
  try {
    const bitmap = draw(ev.data.input);

    ctx.postMessage({ id: ev.data.id, bitmap }, [bitmap]);
  } catch (e) {
    ctx.postMessage({ id: ev.data.id, error: e instanceof Error ? e.message : String(e) });
  }
};
