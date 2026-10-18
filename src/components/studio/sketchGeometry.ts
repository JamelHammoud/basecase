import type { CustomModelSubNode } from '../../types/robotics';

export type SketchPoint = [number, number];

export type SketchMode = 'extrude' | 'revolve';

export type SketchTool = 'polygon' | 'freehand' | 'hole';

export interface CreateFrom2DDrawingParams {
  name: string;
  mode: 'extrude' | 'revolve' | 'svg';
  widthMm: number;
  heightMm: number;
  depthMm: number;
  color: string;
  bevel: boolean;
  nodes: CustomModelSubNode[];
  svgDataUrl?: string;
  saveToLibrary: boolean;
}

export interface SketchOutput {
  name: string;
  spanMm: number;
  heightMm: number;
  bevel: boolean;
  color: string;
}

const clampHalf = (v: number) => Math.max(-0.48, Math.min(0.48, v));

export const snapSketchPoint = ([x, z]: SketchPoint, coarse: boolean): SketchPoint => {
  const steps = coarse ? 20 : 200;

  return [Math.round(clampHalf(x) * steps) / steps, Math.round(clampHalf(z) * steps) / steps];
};

export const holeLoopAt = ([nx, nz]: SketchPoint): SketchPoint[] => {
  const loop: SketchPoint[] = [];
  const r = 0.065;
  const segs = 14;

  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;

    loop.push([Math.round((nx + Math.cos(a) * r) * 1000) / 1000, Math.round((nz + Math.sin(a) * r) * 1000) / 1000]);
  }

  return loop;
};

export const appendFreehandPoint = (prev: SketchPoint[], [nx, nz]: SketchPoint): SketchPoint[] => {
  if (prev.length === 0) return [[nx, nz]];

  const [lx, lz] = prev[prev.length - 1];

  if (Math.hypot(nx - lx, nz - lz) < 0.03) return prev;

  return [...prev, [nx, nz]];
};

const latheNode = (outerPoints: SketchPoint[], output: SketchOutput, now: number): CustomModelSubNode => ({
  id: `node-lathe-${now}`,
  name: output.name,
  nodeType: 'lathe',
  role: 'solid',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  dimensions: { width: output.spanMm, height: output.heightMm, depth: output.spanMm },
  color: output.color,
  lathe: {
    profilePoints: outerPoints.map(([x, z]) => [Math.max(0.04, Math.min(0.49, Math.abs(x))), -z]),
    segments: 36,
  },
});

const extrudeNode = (
  outerPoints: SketchPoint[],
  holes: SketchPoint[][],
  output: SketchOutput,
  now: number,
): CustomModelSubNode => ({
  id: `node-extrude-${now}`,
  name: output.name,
  nodeType: 'contour_extrude',
  role: 'solid',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  dimensions: { width: output.spanMm, height: output.heightMm, depth: output.spanMm },
  color: output.color,
  contour: {
    outerLoop: outerPoints.map(([x, z]) => [x, -z]),
    holes: holes.map((h) => h.map(([x, z]) => [x, -z])),
    bevel: output.bevel,
  },
});

export const sketchDrawing = ({
  mode,
  outerPoints,
  holes,
  output,
  saveToLibrary,
  now,
}: {
  mode: SketchMode;
  outerPoints: SketchPoint[];
  holes: SketchPoint[][];
  output: SketchOutput;
  saveToLibrary: boolean;
  now: number;
}): CreateFrom2DDrawingParams => {
  const revolve = mode === 'revolve';

  return {
    name: output.name,
    mode,
    widthMm: output.spanMm,
    heightMm: output.heightMm,
    depthMm: output.spanMm,
    color: output.color,
    bevel: revolve ? false : output.bevel,
    nodes: [revolve ? latheNode(outerPoints, output, now) : extrudeNode(outerPoints, holes, output, now)],
    saveToLibrary,
  };
};
