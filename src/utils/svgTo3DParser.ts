import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
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

/**
 * Parses an SVG string using Three.js SVGLoader and converts all vector paths & compound holes
 * into normalized 3D-extrudable CustomModelSubNode objects in millimeters.
 */
export function parseSvgTo3DNodes(
  svgText: string,
  fileName = 'Imported Vector.svg',
  targetSpanMm = 70,
  extrudeHeightMm = 10,
  bevel = true,
  overrideColor?: string
): ParsedSvg3DResult {
  const loader = new SVGLoader();
  const svgData = loader.parse(svgText);

  const extractedShapes: Array<{
    outerPts: THREE.Vector2[];
    holesPts: THREE.Vector2[][];
    color: string;
  }> = [];

  let minX = Infinity,
    minY = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity;
  let totalHoles = 0;

  for (const path of svgData.paths) {
    // Skip transparent fill="none" paths unless they are the only paths in the SVG
    const fillStyle = (path.userData as Record<string, any> | undefined)?.style?.fill;
    if (fillStyle === 'none' && svgData.paths.length > 1) {
      continue;
    }

    const shapes = SVGLoader.createShapes(path);
    const hexColor =
      overrideColor ||
      (path.color && fillStyle !== 'none'
        ? '#' + path.color.getHexString()
        : '#e4e4e7');

    for (const shape of shapes) {
      const outerPts = shape.getSpacedPoints(48);
      if (outerPts.length < 3) continue;

      for (const pt of outerPts) {
        if (pt.x < minX) minX = pt.x;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.y > maxY) maxY = pt.y;
      }

      const holesPts: THREE.Vector2[][] = [];
      for (const hole of shape.holes || []) {
        const hPts = hole.getSpacedPoints(28);
        if (hPts.length >= 3) {
          holesPts.push(hPts);
          totalHoles++;
        }
      }

      extractedShapes.push({
        outerPts,
        holesPts,
        color: hexColor,
      });
    }
  }

  // Fallback if SVG only had stroked paths with fill="none"
  if (extractedShapes.length === 0) {
    for (const path of svgData.paths) {
      for (const subPath of path.subPaths) {
        const pts = subPath.getSpacedPoints(48);
        if (pts.length < 3) continue;
        for (const pt of pts) {
          if (pt.x < minX) minX = pt.x;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y < minY) minY = pt.y;
          if (pt.y > maxY) maxY = pt.y;
        }
        extractedShapes.push({
          outerPts: pts,
          holesPts: [],
          color: overrideColor || '#e4e4e7',
        });
      }
    }
  }

  if (extractedShapes.length === 0 || !Number.isFinite(minX)) {
    throw new Error('Use an SVG with closed shapes, or try a sample.');
  }

  const rawW = Math.max(1e-3, maxX - minX);
  const rawH = Math.max(1e-3, maxY - minY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const aspect = rawW / rawH;

  const widthMm =
    aspect >= 1
      ? Math.round(targetSpanMm)
      : Math.max(8, Math.round(targetSpanMm * aspect));
  const depthMm =
    aspect >= 1
      ? Math.max(8, Math.round(targetSpanMm / aspect))
      : Math.round(targetSpanMm);

  const cleanName = fileName.replace(/\.svg$/i, '').trim() || 'SVG Part';

  // Normalize all shapes into [-0.5 .. +0.5] of the overall SVG bounding box so multi-path SVGs stay aligned
  const nodes: CustomModelSubNode[] = extractedShapes.map((item, idx) => {
    const outerLoop: Array<[number, number]> = item.outerPts.map((pt) => [
      Math.round(((pt.x - cx) / rawW) * 10000) / 10000,
      // Invert Y because SVG Y-axis points down
      Math.round((-(pt.y - cy) / rawH) * 10000) / 10000,
    ]);

    const holes: Array<Array<[number, number]>> = item.holesPts.map((hLoop) =>
      hLoop.map((pt) => [
        Math.round(((pt.x - cx) / rawW) * 10000) / 10000,
        Math.round((-(pt.y - cy) / rawH) * 10000) / 10000,
      ])
    );

    return {
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
      color: overrideColor || item.color || '#e4e4e7',
      contour: {
        outerLoop,
        holes,
        bevel,
      },
    };
  });

  const svgBase64 =
    'data:image/svg+xml;utf8,' + encodeURIComponent(svgText.trim());

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
    svgDataUrl: svgBase64,
  };
}
