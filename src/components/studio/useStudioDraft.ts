import { useState } from 'react';
import { polylineSketch } from '../../utils/sketch/edit';
import type { Sketch, SketchMode, Vec2 } from '../../utils/sketch/types';
import { ParsedSvg3DResult, parseSvgTo3DNodes } from '../../utils/svgTo3DParser';

export type SketchTool = 'line' | 'rect' | 'circle' | 'arc';

interface SketchHistory {
  past: Sketch[];
  now: Sketch;
  future: Sketch[];
}

const HISTORY_LIMIT = 100;

const svgLoops = (outer: Array<[number, number]>, holes: Array<Array<[number, number]>>, span: number): Vec2[][] =>
  [outer, ...holes].map((loop) => loop.map(([x, z]): Vec2 => [x * span, -z * span]));

function useSketchHistory(initial: Sketch) {
  const [history, setHistory] = useState<SketchHistory>({ past: [], now: initial, future: [] });

  return {
    sketch: history.now,
    canUndo: history.past.length > 0,
    apply: (next: Sketch) =>
      setHistory((h) => ({ past: [...h.past, h.now].slice(-HISTORY_LIMIT), now: next, future: [] })),
    undo: () =>
      setHistory((h) =>
        h.past.length ? { past: h.past.slice(0, -1), now: h.past[h.past.length - 1], future: [h.now, ...h.future] } : h,
      ),
    redo: () =>
      setHistory((h) =>
        h.future.length ? { past: [...h.past, h.now], now: h.future[0], future: h.future.slice(1) } : h,
      ),
  };
}

export function useStudioDraft(initialSketch: Sketch, initialTool: SketchTool | null) {
  const history = useSketchHistory(initialSketch);
  const [drawMode, setDrawMode] = useState<SketchMode>('extrude');
  const [drawTool, setDrawTool] = useState<SketchTool | null>(initialTool);
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

      history.apply(polylineSketch(svgLoops(contour.outerLoop, contour.holes ?? [], drawSpanMm)));
    } catch (err) {
      setSvgError(String(err));
      setParsedSvg(null);
    }
  };

  return {
    ...history,
    drawMode,
    setDrawMode,
    drawTool,
    setDrawTool,
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
