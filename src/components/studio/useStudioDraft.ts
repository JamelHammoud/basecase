import { useState } from 'react';
import { ParsedSvg3DResult, parseSvgTo3DNodes } from '../../utils/svgTo3DParser';
import type { SketchMode, SketchPoint, SketchTool } from './sketchGeometry';

const INITIAL_OUTLINE: SketchPoint[] = [
  [-0.35, -0.25],
  [0.35, -0.25],
  [0.42, 0.0],
  [0.25, 0.32],
  [-0.25, 0.32],
  [-0.42, 0.0],
];

export function useStudioDraft() {
  const [drawMode, setDrawMode] = useState<SketchMode>('extrude');
  const [drawTool, setDrawTool] = useState<SketchTool>('polygon');
  const [outerPoints, setOuterPoints] = useState<SketchPoint[]>(INITIAL_OUTLINE);
  const [holes, setHoles] = useState<SketchPoint[][]>([]);
  const [isDrawingFreehand, setIsDrawingFreehand] = useState(false);
  const [snap2D, setSnap2D] = useState(true);
  const [drawName, setDrawName] = useState('Sketch');
  const [drawSpanMm, setDrawSpanMm] = useState(64);
  const [drawHeightMm, setDrawHeightMm] = useState(10);
  const [drawBevel, setDrawBevel] = useState(true);
  const [drawColor, setDrawColor] = useState('#e4e4e7');
  const [rawSvgText, setRawSvgText] = useState<string>('');
  const [svgFileName, setSvgFileName] = useState<string>('Imported.svg');
  const [parsedSvg, setParsedSvg] = useState<ParsedSvg3DResult | null>(null);
  const [svgError, setSvgError] = useState<string | null>(null);
  const [showPasteSvg, setShowPasteSvg] = useState<boolean>(false);

  const processSvgString = (svgContent: string, fileName: string) => {
    try {
      setSvgError(null);
      setRawSvgText(svgContent);
      setSvgFileName(fileName);

      const parsed = parseSvgTo3DNodes(svgContent, {
        fileName,
        targetSpanMm: drawSpanMm,
        extrudeHeightMm: drawHeightMm,
        bevel: drawBevel,
        overrideColor: drawColor,
      });
      const contour = parsed.nodes.length > 0 ? parsed.nodes[0].contour : undefined;

      setParsedSvg(parsed);
      setDrawName(parsed.name);

      if (!contour) return;

      setOuterPoints(contour.outerLoop.map(([x, z]) => [x, -z]));
      setHoles((contour.holes || []).map((h) => h.map(([x, z]) => [x, -z])));
    } catch (err) {
      setSvgError(String(err));
      setParsedSvg(null);
    }
  };

  return {
    drawMode,
    setDrawMode,
    drawTool,
    setDrawTool,
    outerPoints,
    setOuterPoints,
    holes,
    setHoles,
    isDrawingFreehand,
    setIsDrawingFreehand,
    snap2D,
    setSnap2D,
    drawName,
    setDrawName,
    drawSpanMm,
    setDrawSpanMm,
    drawHeightMm,
    setDrawHeightMm,
    drawBevel,
    setDrawBevel,
    drawColor,
    setDrawColor,
    rawSvgText,
    svgFileName,
    parsedSvg,
    svgError,
    setSvgError,
    showPasteSvg,
    setShowPasteSvg,
    processSvgString,
  };
}

export type StudioDraft = ReturnType<typeof useStudioDraft>;
