import * as THREE from 'three';
import { dataShapeGeometry } from '../../dataLayers/shapeGeometry';
import type { ShapeKind } from '../../dataLayers/shapes';
import type { SpatialSnapshot } from './comparisonSpatial';
import { comparisonSpatialSession } from './comparisonSpatial';
import type { ComparisonSource } from './comparison';

const WIDTH = 512;
const HEIGHT = 256;

function boundsOf(frame: SpatialSnapshot) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const include = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  };

  include(0, 0);

  for (const list of [frame.points, frame.lines]) {
    for (let i = 0; i < list.length; i += 3) include(list[i], -list[i + 2]);
  }

  const matrix = new THREE.Matrix4();
  const vertex = new THREE.Vector3();

  for (const shape of frame.shapes) {
    const edges = edgesOf(shape.kind);

    matrix.fromArray(shape.matrix);

    for (let i = 0; i < edges.count; i++) {
      vertex.fromBufferAttribute(edges, i).applyMatrix4(matrix);
      include(vertex.x, -vertex.z);
    }
  }

  const grid = frame.grid?.matrix;

  if (grid) {
    for (const [x, y] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ])
      include(grid[0] * x + grid[4] * y + grid[12], -(grid[2] * x + grid[6] * y + grid[14]));
  }

  return Number.isFinite(minX)
    ? { x: (minX + maxX) / 2, y: (minY + maxY) / 2, span: Math.max(maxX - minX, (maxY - minY) * 2, 100) * 1.1 }
    : { x: 0, y: 0, span: 1000 };
}

function drawGrid(context: OffscreenCanvasRenderingContext2D, frame: SpatialSnapshot) {
  const grid = frame.grid;

  if (!grid) return;

  const image = new OffscreenCanvas(grid.width, grid.height);
  const pixels = image.getContext('2d');

  if (!pixels) return;

  pixels.putImageData(new ImageData(Uint8ClampedArray.from(grid.texels), grid.width, grid.height), 0, 0);

  const m = grid.matrix;

  context.save();
  context.transform(m[0], -m[2], m[4], -m[6], m[12], -m[14]);
  context.drawImage(image, 0, 0, 1, 1);
  context.restore();
  image.width = 1;
}

const shapeEdges = new Map<ShapeKind, THREE.BufferAttribute>();

function edgesOf(kind: ShapeKind) {
  if (!shapeEdges.has(kind)) {
    const geometry = dataShapeGeometry(kind);
    const edges = new THREE.EdgesGeometry(geometry, 20);

    shapeEdges.set(kind, edges.getAttribute('position') as THREE.BufferAttribute);
    geometry.dispose();
    edges.dispose();
  }

  return shapeEdges.get(kind)!;
}

function drawShapes(context: OffscreenCanvasRenderingContext2D, frame: SpatialSnapshot) {
  const position = new THREE.Vector3();
  const matrix = new THREE.Matrix4();

  for (const shape of frame.shapes) {
    const edges = edgesOf(shape.kind);

    matrix.fromArray(shape.matrix);
    context.strokeStyle = `rgba(${shape.color
      .slice(0, 3)
      .map((value) => Math.round(value * 255))
      .join(',')},${shape.color[3]})`;
    context.beginPath();

    for (let i = 0; i < edges.count; i++) {
      position.fromBufferAttribute(edges, i).applyMatrix4(matrix);

      if (i % 2 === 0) context.moveTo(position.x, -position.z);
      else context.lineTo(position.x, -position.z);
    }

    context.stroke();
  }
}

export function spatialBitmap(frame: SpatialSnapshot) {
  const canvas = new OffscreenCanvas(WIDTH, HEIGHT);
  const context = canvas.getContext('2d');

  if (!context) throw new Error('Open the try again.');

  const bounds = boundsOf(frame);
  const scale = WIDTH / bounds.span;

  context.fillStyle = '#1b1b1b';
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.translate(WIDTH / 2, HEIGHT / 2);
  context.scale(scale, -scale);
  context.translate(-bounds.x, -bounds.y);
  drawGrid(context, frame);
  context.fillStyle = '#0d99ff';
  context.strokeStyle = '#0d99ff';
  context.lineWidth = 1.5 / scale;

  for (let i = 0; i < frame.points.length; i += 3)
    context.fillRect(frame.points[i] - 1 / scale, -frame.points[i + 2] - 1 / scale, 2 / scale, 2 / scale);

  context.beginPath();

  for (let i = 0; i < frame.lines.length; i += 6) {
    context.moveTo(frame.lines[i], -frame.lines[i + 2]);
    context.lineTo(frame.lines[i + 3], -frame.lines[i + 5]);
  }

  context.stroke();
  drawShapes(context, frame);

  const bitmap = canvas.transferToImageBitmap();

  canvas.width = 1;

  return { bitmap, span: bounds.span };
}

export function comparisonSpatialImageSession() {
  const geometry = comparisonSpatialSession();
  let drawn: SpatialSnapshot | null = null;
  let bitmap: ImageBitmap | null = null;
  let span = 0;
  const close = () => {
    bitmap?.close();
    bitmap = null;
    drawn = null;
  };
  const prepare = (frame: SpatialSnapshot) => {
    if (frame === drawn) return;

    close();
    drawn = frame;

    if (frame.at === null || frame.missing) return;

    const result = spatialBitmap(frame);

    bitmap = result.bitmap;
    span = result.span;
  };

  return {
    close,
    async read(source: ComparisonSource, topic: string, time: number) {
      const frame = geometry.read(source, topic, time);

      prepare(frame);

      const copy = bitmap ? await createImageBitmap(bitmap) : null;

      return {
        bitmap: copy,
        frame: frame.frame,
        missing: frame.missing,
        at: frame.at,
        clipped: frame.clipped,
        span,
        bytes: copy ? copy.width * copy.height * 4 : 0,
      };
    },
  };
}
