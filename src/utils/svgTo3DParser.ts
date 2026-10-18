import * as THREE from 'three';
import { SVGLoader, SVGResult } from 'three/examples/jsm/loaders/SVGLoader.js';
import { CustomModelSubNode, PartDimensions } from '../types/robotics';

export interface ParsedSvg3DResult {
  name: string;
  shapeCount: number;
  holeCount: number;
  aspectRatio: number;
  suggestedDimensions: PartDimensions;
  nodes: CustomModelSubNode[];
  svgDataUrl: string;
}

interface ExtractedShape {
  outerPts: THREE.Vector2[];
  holesPts: THREE.Vector2[][];
  color: string;
}

const DEFAULT_COLOR = '#e4e4e7';

function filledShapes(svgData: SVGResult, overrideColor?: string): ExtractedShape[] {
  const out: ExtractedShape[] = [];

  for (const path of svgData.paths) {
    const fillStyle = (path.userData as { style?: { fill?: string } } | undefined)?.style?.fill;

    if (fillStyle === 'none' && svgData.paths.length > 1) continue;

    const hexColor =
      overrideColor || (path.color && fillStyle !== 'none' ? '#' + path.color.getHexString() : DEFAULT_COLOR);

    for (const shape of SVGLoader.createShapes(path)) {
      const outerPts = shape.getSpacedPoints(48);

      if (outerPts.length < 3) continue;

      const holesPts = (shape.holes || []).map((hole) => hole.getSpacedPoints(28)).filter((h) => h.length >= 3);

      out.push({ outerPts, holesPts, color: hexColor });
    }
  }

  return out;
}

function outlineShapes(svgData: SVGResult, overrideColor?: string): ExtractedShape[] {
  return svgData.paths
    .flatMap((path) => path.subPaths.map((subPath) => subPath.getSpacedPoints(48)))
    .filter((pts) => pts.length >= 3)
    .map((pts) => ({ outerPts: pts, holesPts: [], color: overrideColor || DEFAULT_COLOR }));
}

function shapeBounds(shapes: ExtractedShape[]) {
  let minX = Infinity,
    minY = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity;

  for (const pt of shapes.flatMap((s) => s.outerPts)) {
    minX = Math.min(minX, pt.x);
    maxX = Math.max(maxX, pt.x);
    minY = Math.min(minY, pt.y);
    maxY = Math.max(maxY, pt.y);
  }

  return { minX, minY, maxX, maxY };
}

export interface ParseSvgOptions {
  fileName?: string;
  targetSpanMm?: number;
  extrudeHeightMm?: number;
  bevel?: boolean;
  overrideColor?: string;
}

export function parseSvgTo3DNodes(
  svgText: string,
  {
    fileName = 'Imported Vector.svg',
    targetSpanMm = 70,
    extrudeHeightMm = 10,
    bevel = true,
    overrideColor,
  }: ParseSvgOptions = {},
): ParsedSvg3DResult {
  const svgData = new SVGLoader().parse(svgText);
  const filled = filledShapes(svgData, overrideColor);
  const extractedShapes = filled.length ? filled : outlineShapes(svgData, overrideColor);
  const totalHoles = filled.reduce((n, s) => n + s.holesPts.length, 0);
  const { minX, minY, maxX, maxY } = shapeBounds(extractedShapes);

  if (extractedShapes.length === 0 || !Number.isFinite(minX)) {
    throw new Error('Use an SVG with closed shapes, or try a sample.');
  }

  const rawW = Math.max(1e-3, maxX - minX);
  const rawH = Math.max(1e-3, maxY - minY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const aspect = rawW / rawH;
  const widthMm = aspect >= 1 ? Math.round(targetSpanMm) : Math.max(8, Math.round(targetSpanMm * aspect));
  const depthMm = aspect >= 1 ? Math.max(8, Math.round(targetSpanMm / aspect)) : Math.round(targetSpanMm);
  const cleanName = fileName.replace(/\.svg$/i, '').trim() || 'SVG Part';
  const toLoop = (pts: THREE.Vector2[]): Array<[number, number]> =>
    pts.map((pt) => [
      Math.round(((pt.x - cx) / rawW) * 10000) / 10000,
      Math.round((-(pt.y - cy) / rawH) * 10000) / 10000,
    ]);

  const nodes: CustomModelSubNode[] = extractedShapes.map((item, idx) => ({
    id: `svg-node-${idx + 1}-${Date.now().toString(36)}`,
    name: `${cleanName} Path ${idx + 1}`,
    nodeType: 'contour_extrude',
    role: 'solid',
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    dimensions: {
      width: widthMm,
      height: extrudeHeightMm,
      depth: depthMm,
      thickness: 4,
    },
    color: overrideColor || item.color || DEFAULT_COLOR,
    contour: {
      outerLoop: toLoop(item.outerPts),
      holes: item.holesPts.map(toLoop),
      bevel,
    },
  }));

  return {
    name: cleanName,
    shapeCount: extractedShapes.length,
    holeCount: totalHoles,
    aspectRatio: Math.round(aspect * 100) / 100,
    suggestedDimensions: {
      width: widthMm,
      height: extrudeHeightMm,
      depth: depthMm,
      thickness: 4,
    },
    nodes,
    svgDataUrl: 'data:image/svg+xml;utf8,' + encodeURIComponent(svgText.trim()),
  };
}
