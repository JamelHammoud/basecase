import { InkedStroke, SKETCH_LINE_WIDTH, SketchPen, sketchFrame, traceStroke } from './sketchStrokes';

const EXPORT_SCALE = 3;
const BACKGROUND = '#2c2c2c';

type InkContext = SketchPen & CanvasPathDrawingStyles & CanvasFillStrokeStyles & CanvasDrawPath;

export function inkStrokes(ctx: InkContext, strokes: InkedStroke[]): void {
  ctx.lineWidth = SKETCH_LINE_WIDTH;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const { color, points } of strokes) {
    ctx.strokeStyle = color;
    ctx.beginPath();
    traceStroke(ctx, points);
    ctx.stroke();
  }
}

const canvasBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Couldn’t save the sketch'))), 'image/png');
  });

export async function sketchFile(strokes: InkedStroke[]): Promise<File | null> {
  const frame = sketchFrame(strokes.map((stroke) => stroke.points));
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!frame || !ctx) return null;

  canvas.width = Math.round(frame.width * EXPORT_SCALE);
  canvas.height = Math.round(frame.height * EXPORT_SCALE);
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(EXPORT_SCALE, EXPORT_SCALE);
  ctx.translate(-frame.x, -frame.y);
  inkStrokes(ctx, strokes);

  return new File([await canvasBlob(canvas)], 'Sketch.png', { type: 'image/png' });
}
