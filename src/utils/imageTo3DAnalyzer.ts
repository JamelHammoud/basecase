import { ContourExtrudeData, CustomModelSubNode, PartDimensions } from '../types/robotics';

export interface AnalyzedImageFeatures {
  widthPx: number;
  heightPx: number;
  aspectRatio: number;
  dominantColor: string;
  contour: ContourExtrudeData;
  detectedHoleCenters: Array<{ xNorm: number; zNorm: number; radiusNorm: number }>;
  suggestedDimensions: PartDimensions;
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('')
  );
}

/**
 * Ramer-Douglas-Peucker polygon simplification so traced silhouettes have clean CAD vertices
 */
function simplifyPolygon(
  points: Array<[number, number]>,
  epsilon: number
): Array<[number, number]> {
  if (points.length <= 4) return points;

  let dmax = 0;
  let index = 0;
  const end = points.length - 1;

  const [x1, y1] = points[0];
  const [x2, y2] = points[end];
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;

  for (let i = 1; i < end; i++) {
    const [px, py] = points[i];
    let dist = 0;
    if (lenSq === 0) {
      dist = Math.hypot(px - x1, py - y1);
    } else {
      const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
      dist = Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    }
    if (dist > dmax) {
      index = i;
      dmax = dist;
    }
  }

  if (dmax > epsilon) {
    const rec1 = simplifyPolygon(points.slice(0, index + 1), epsilon);
    const rec2 = simplifyPolygon(points.slice(index), epsilon);
    return rec1.slice(0, rec1.length - 1).concat(rec2);
  } else {
    return [points[0], points[end]];
  }
}

/**
 * Extracts silhouette contour, internal holes, dominant color, and suggested mm dimensions
 * from an uploaded image Data URL.
 */
export async function analyzeImageFor3D(
  dataUrl: string,
  targetSpanMm = 70,
  extrudeHeightMm = 10
): Promise<AnalyzedImageFeatures> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const gridSize = 96;
      const canvas = document.createElement('canvas');
      canvas.width = gridSize;
      canvas.height = gridSize;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not acquire 2D canvas context'));
        return;
      }

      ctx.clearRect(0, 0, gridSize, gridSize);
      ctx.drawImage(img, 0, 0, gridSize, gridSize);
      const { data } = ctx.getImageData(0, 0, gridSize, gridSize);

      // Determine background from corners
      const cornerIndices = [
        0,
        (gridSize - 1) * 4,
        gridSize * (gridSize - 1) * 4,
        (gridSize * gridSize - 1) * 4,
      ];
      let bgR = 0,
        bgG = 0,
        bgB = 0,
        bgA = 0;
      for (const idx of cornerIndices) {
        bgR += data[idx];
        bgG += data[idx + 1];
        bgB += data[idx + 2];
        bgA += data[idx + 3];
      }
      bgR /= 4;
      bgG /= 4;
      bgB /= 4;
      bgA /= 4;

      const hasAlphaBackground = bgA < 128;

      const mask = new Uint8Array(gridSize * gridSize);
      let fgCount = 0;
      let sumR = 0,
        sumG = 0,
        sumB = 0;
      let minX = gridSize,
        maxX = 0,
        minY = gridSize,
        maxY = 0;

      for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
          const i = (y * gridSize + x) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];

          let isForeground = false;
          if (hasAlphaBackground) {
            isForeground = a > 90;
          } else {
            const colorDist = Math.hypot(r - bgR, g - bgG, b - bgB);
            isForeground = a > 90 && colorDist > 38;
          }

          if (isForeground) {
            mask[y * gridSize + x] = 1;
            fgCount++;
            sumR += r;
            sumG += g;
            sumB += b;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      // If almost empty or full-frame photo, create a clean rounded-chamfered profile
      const dominantColor =
        fgCount > 20
          ? rgbToHex(sumR / fgCount, sumG / fgCount, sumB / fgCount)
          : '#d4d4d8';

      const aspect = img.width / Math.max(1, img.height);
      const widthMm =
        aspect >= 1 ? Math.round(targetSpanMm) : Math.max(16, Math.round(targetSpanMm * aspect));
      const depthMm =
        aspect >= 1
          ? Math.max(16, Math.round(targetSpanMm / aspect))
          : Math.round(targetSpanMm);

      // Trace radial outer boundary in 48 angular sectors around centroid for a watertight, self-intersection-free CAD contour
      const cx = fgCount > 20 ? (minX + maxX) / 2 : gridSize / 2;
      const cy = fgCount > 20 ? (minY + maxY) / 2 : gridSize / 2;
      const spanX = Math.max(12, maxX - minX);
      const spanY = Math.max(12, maxY - minY);

      const numAngles = 48;
      const rawRadialPoints: Array<[number, number]> = [];

      if (fgCount > 35 && fgCount < gridSize * gridSize * 0.94) {
        for (let aIdx = 0; aIdx < numAngles; aIdx++) {
          const theta = (aIdx / numAngles) * Math.PI * 2;
          const cos = Math.cos(theta);
          const sin = Math.sin(theta);
          let furthestR = 0.08 * Math.min(spanX, spanY);

          const maxRay = Math.hypot(gridSize, gridSize) * 0.6;
          for (let r = 1; r < maxRay; r += 0.75) {
            const sx = Math.round(cx + cos * r);
            const sy = Math.round(cy + sin * r);
            if (sx < 0 || sx >= gridSize || sy < 0 || sy >= gridSize) break;
            if (mask[sy * gridSize + sx] === 1) {
              furthestR = r;
            }
          }

          const pxNorm = Math.max(-0.49, Math.min(0.49, (cos * furthestR) / spanX));
          // Flip Y so image top is -Z / +Z properly
          const pzNorm = Math.max(-0.49, Math.min(0.49, -(sin * furthestR) / spanY));
          rawRadialPoints.push([
            Math.round(pxNorm * 1000) / 1000,
            Math.round(pzNorm * 1000) / 1000,
          ]);
        }
      } else {
        // Chamfered octagon mechanical plate contour fallback
        rawRadialPoints.push(
          [-0.46, -0.36],
          [-0.36, -0.46],
          [0.36, -0.46],
          [0.46, -0.36],
          [0.46, 0.36],
          [0.36, 0.46],
          [-0.36, 0.46],
          [-0.46, 0.36]
        );
      }

      const simplifiedOuter = simplifyPolygon(
        [...rawRadialPoints, rawRadialPoints[0]],
        0.022
      ).slice(0, -1);

      const outerLoop =
        simplifiedOuter.length >= 4 ? simplifiedOuter : rawRadialPoints;

      // Detect internal background islands (mounting holes / cutouts inside bounding box)
      const detectedHoleCenters: Array<{ xNorm: number; zNorm: number; radiusNorm: number }> = [];
      const visited = new Uint8Array(gridSize * gridSize);

      // Flood-fill exterior background from border first
      const queue: number[] = [];
      for (let x = 0; x < gridSize; x++) {
        queue.push(x, (gridSize - 1) * gridSize + x);
      }
      for (let y = 0; y < gridSize; y++) {
        queue.push(y * gridSize, y * gridSize + (gridSize - 1));
      }
      while (queue.length > 0) {
        const idx = queue.pop()!;
        if (visited[idx] || mask[idx] === 1) continue;
        visited[idx] = 1;
        const x = idx % gridSize;
        const y = Math.floor(idx / gridSize);
        if (x > 0) queue.push(idx - 1);
        if (x < gridSize - 1) queue.push(idx + 1);
        if (y > 0) queue.push(idx - gridSize);
        if (y < gridSize - 1) queue.push(idx + gridSize);
      }

      // Any remaining unvisited 0-pixels inside bounding box are internal holes!
      for (let y = minY + 1; y < maxY; y++) {
        for (let x = minX + 1; x < maxX; x++) {
          const startIdx = y * gridSize + x;
          if (mask[startIdx] === 0 && !visited[startIdx]) {
            let holePixels = 0;
            let hxSum = 0,
              hySum = 0;
            const hQueue = [startIdx];
            visited[startIdx] = 1;
            while (hQueue.length > 0) {
              const curr = hQueue.pop()!;
              holePixels++;
              const cxp = curr % gridSize;
              const cyp = Math.floor(curr / gridSize);
              hxSum += cxp;
              hySum += cyp;
              const neighbors = [curr - 1, curr + 1, curr - gridSize, curr + gridSize];
              for (const n of neighbors) {
                if (n >= 0 && n < gridSize * gridSize && !visited[n] && mask[n] === 0) {
                  visited[n] = 1;
                  hQueue.push(n);
                }
              }
            }

            if (holePixels >= 4 && holePixels < spanX * spanY * 0.35) {
              const hcx = hxSum / holePixels;
              const hcy = hySum / holePixels;
              const xNorm = (hcx - cx) / spanX;
              const zNorm = -(hcy - cy) / spanY;
              const radiusNorm = Math.sqrt(holePixels / Math.PI) / Math.max(spanX, spanY);
              detectedHoleCenters.push({
                xNorm: Math.round(xNorm * 1000) / 1000,
                zNorm: Math.round(zNorm * 1000) / 1000,
                radiusNorm: Math.max(0.035, Math.min(0.18, Math.round(radiusNorm * 1000) / 1000)),
              });
            }
          }
        }
      }

      // Build circular hole loops for up to 6 detected internal holes
      const holes: Array<Array<[number, number]>> = detectedHoleCenters
        .slice(0, 6)
        .map((h) => {
          const loop: Array<[number, number]> = [];
          const segs = 12;
          for (let i = 0; i < segs; i++) {
            const a = (i / segs) * Math.PI * 2;
            loop.push([
              Math.round((h.xNorm + Math.cos(a) * h.radiusNorm) * 1000) / 1000,
              Math.round((h.zNorm + Math.sin(a) * h.radiusNorm) * 1000) / 1000,
            ]);
          }
          return loop;
        });

      resolve({
        widthPx: img.width,
        heightPx: img.height,
        aspectRatio: Math.round(aspect * 100) / 100,
        dominantColor,
        contour: {
          outerLoop,
          holes,
          bevel: true,
        },
        detectedHoleCenters,
        suggestedDimensions: {
          width: widthMm,
          height: extrudeHeightMm,
          depth: depthMm,
          thickness: 4,
        },
      });
    };
    img.onerror = () => reject(new Error('Failed to load image for 3D analysis'));
    img.src = dataUrl;
  });
}

export function buildNodesFromImageAnalysis(
  name: string,
  features: AnalyzedImageFeatures,
  customPrompt?: string
): CustomModelSubNode[] {
  const { width, height, depth } = features.suggestedDimensions;
  const nodes: CustomModelSubNode[] = [
    {
      id: 'node-main-contour',
      name: `${name} Body`,
      nodeType: 'contour_extrude',
      role: 'solid',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      dimensions: { width, height, depth },
      color: features.dominantColor,
      contour: features.contour,
    },
  ];

  const promptLower = (customPrompt || '').toLowerCase();
  if (promptLower.includes('boss') || promptLower.includes('hub') || promptLower.includes('shaft')) {
    nodes.push({
      id: 'node-center-boss',
      name: 'Raised Hub Boss',
      nodeType: 'primitive',
      primitiveKind: 'tube',
      role: 'solid',
      position: [0, height * 0.65, 0],
      rotation: [0, 0, 0],
      dimensions: {
        width: Math.round(Math.min(width, depth) * 0.35),
        height: Math.round(height * 0.8),
        depth: Math.round(Math.min(width, depth) * 0.35),
        thickness: 4,
      },
      color: '#a1a1aa',
    });
  }

  return nodes;
}
