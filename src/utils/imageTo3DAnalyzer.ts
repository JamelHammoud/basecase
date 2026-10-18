import { ContourExtrudeData, CustomModelSubNode, PartDimensions } from '../types/robotics';
import { analyzePixels } from './imagePixelAnalysis';

export interface AnalyzedImageFeatures {
  widthPx: number;
  heightPx: number;
  aspectRatio: number;
  dominantColor: string;
  contour: ContourExtrudeData;
  detectedHoleCenters: Array<{ xNorm: number; zNorm: number; radiusNorm: number }>;
  suggestedDimensions: PartDimensions;
}

export async function analyzeImageFor3D(
  dataUrl: string,
  targetSpanMm = 70,
  extrudeHeightMm = 10,
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

      resolve(
        analyzePixels({
          data,
          gridSize,
          imageWidth: img.width,
          imageHeight: img.height,
          targetSpanMm,
          extrudeHeightMm,
        }),
      );
    };
    img.onerror = () => reject(new Error('Failed to load image for 3D analysis'));
    img.src = dataUrl;
  });
}

export function buildNodesFromImageAnalysis(
  name: string,
  features: AnalyzedImageFeatures,
  customPrompt?: string,
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
