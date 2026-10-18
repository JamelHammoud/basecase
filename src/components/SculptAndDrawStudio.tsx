import React, { useRef, useState } from 'react';
import {
  Box,
  Pill,
  CircleDot,
  Cylinder,
  Eraser,
  FileUp,
  Magnet,
  Minus,
  Pencil,
  PenTool,
  Plus,
  Sparkles,
} from 'lucide-react';
import {
  Button,
  IconButton,
  NumberInput,
  Section,
  SegmentedControl,
  Slider,
  Switch,
  TextArea,
  TextInput,
  Tooltip,
  useScrollFade,
} from '../design-system';
import {
  CustomModelSubNode,
  ScenePart,
  SculptBrushKind,
  SculptSettings,
} from '../types/robotics';
import { ParsedSvg3DResult, parseSvgTo3DNodes } from '../utils/svgTo3DParser';

/** Sculpt while the Sculpt tool is on; Sketch and Import SVG while creating a part */
export type StudioSubTab = 'clay' | 'draw2d' | 'svg';

const MODE_TITLES: Record<StudioSubTab, string> = { clay: 'Sculpt', draw2d: 'Sketch', svg: 'Import SVG' };

interface SculptAndDrawStudioProps {
  selectedPart: ScenePart | null;
  sculptSettings: SculptSettings;
  mode: StudioSubTab;
  onChangeMode: (mode: StudioSubTab) => void;
  /** Leaves the mode and returns the panel to the Inspector */
  onDone: () => void;
  onUpdateSculptSettings: (patch: Partial<SculptSettings>) => void;
  onAddClayPreset: (
    preset: 'clay_sphere' | 'clay_box' | 'clay_cylinder' | 'clay_capsule'
  ) => void;
  onSubdivideSelectedClay: () => void;
  onCreateFrom2DDrawing: (params: {
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
  }) => void;
}

const SAMPLE_ROBOTICS_SVGS: Array<{ name: string; svg: string }> = [
  {
    name: '4-Bolt Motor Mount Flange.svg',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -50 100 100">
  <path fill="#3b82f6" fill-rule="evenodd" d="
    M -32,-42 L 32,-42 A 10,10 0 0,1 42,-32 L 42,32 A 10,10 0 0,1 32,42 L -32,42 A 10,10 0 0,1 -42,32 L -42,-32 A 10,10 0 0,1 -32,-42 Z
    M 0,-16 A 16,16 0 1,0 0,16 A 16,16 0 1,0 0,-16 Z
    M -28,-32 A 4,4 0 1,0 -28,-24 A 4,4 0 1,0 -28,-32 Z
    M 28,-32 A 4,4 0 1,0 28,-24 A 4,4 0 1,0 28,-32 Z
    M -28,24 A 4,4 0 1,0 -28,32 A 4,4 0 1,0 -28,24 Z
    M 28,24 A 4,4 0 1,0 28,32 A 4,4 0 1,0 28,24 Z
  "/>
</svg>`,
  },
  {
    name: 'Slotted Link Arm.svg',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-60 -25 120 50">
  <path fill="#10b981" fill-rule="evenodd" d="
    M -40,-18 L 40,-18 A 18,18 0 0,1 40,18 L -40,18 A 18,18 0 0,1 -40,-18 Z
    M -40,-6 A 6,6 0 1,0 -40,6 A 6,6 0 1,0 -40,-6 Z
    M 40,-6 A 6,6 0 1,0 40,6 A 6,6 0 1,0 40,-6 Z
    M -18,-5 L 18,-5 A 5,5 0 0,1 18,5 L -18,5 A 5,5 0 0,1 -18,-5 Z
  "/>
</svg>`,
  },
  {
    name: 'Bellcrank Triangle Horn.svg',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -50 100 100">
  <path fill="#f97316" fill-rule="evenodd" d="
    M -36,-34 L 38,-10 L -10,38 Z
    M -24,-24 A 5,5 0 1,0 -24,-14 A 5,5 0 1,0 -24,-24 Z
    M 20,-10 A 4,4 0 1,0 20,-2 A 4,4 0 1,0 20,-10 Z
    M -10,18 A 4,4 0 1,0 -10,26 A 4,4 0 1,0 -10,18 Z
  "/>
</svg>`,
  },
];

const BRUSH_OPTIONS: Array<{
  id: SculptBrushKind;
  label: string;
  desc: string;
}> = [
  { id: 'inflate', label: 'Inflate', desc: 'Build volume outward' },
  { id: 'carve', label: 'Carve', desc: 'Push the surface inward' },
  { id: 'grab', label: 'Grab', desc: 'Pull the shape' },
  { id: 'flatten', label: 'Flatten', desc: 'Make a flat face' },
  { id: 'smooth', label: 'Smooth', desc: 'Relax the surface' },
  { id: 'pinch', label: 'Pinch', desc: 'Sharpen a crease' },
];

const CLAY_PRESETS = [
  { id: 'clay_sphere', label: 'Sphere', icon: <CircleDot className="w-4 h-4" /> },
  { id: 'clay_box', label: 'Block', icon: <Box className="w-4 h-4" /> },
  { id: 'clay_capsule', label: 'Capsule', icon: <Pill className="w-4 h-4" /> },
  { id: 'clay_cylinder', label: 'Cylinder', icon: <Cylinder className="w-4 h-4" /> },
] as const;

const DRAW_COLORS = ['#e4e4e7', '#3f3f46', '#f97316', '#0d99ff', '#22c55e'];

export const SculptAndDrawStudio: React.FC<SculptAndDrawStudioProps> = ({
  selectedPart,
  sculptSettings,
  mode: subTab,
  onChangeMode: setSubTab,
  onDone,
  onUpdateSculptSettings,
  onAddClayPreset,
  onSubdivideSelectedClay,
  onCreateFrom2DDrawing,
}) => {
  const { ref: setFadeEl, style: fadeStyle } = useScrollFade();

  // 2D Draw Pad State
  const svgRef = useRef<SVGSVGElement | null>(null);
  const svgFileInputRef = useRef<HTMLInputElement | null>(null);

  const [drawMode, setDrawMode] = useState<'extrude' | 'revolve'>('extrude');
  const [drawTool, setDrawTool] = useState<'polygon' | 'freehand' | 'hole'>(
    'polygon'
  );
  const [outerPoints, setOuterPoints] = useState<Array<[number, number]>>([
    [-0.35, -0.25],
    [0.35, -0.25],
    [0.42, 0.0],
    [0.25, 0.32],
    [-0.25, 0.32],
    [-0.42, 0.0],
  ]);
  const [holes, setHoles] = useState<Array<Array<[number, number]>>>([]);
  const [isDrawingFreehand, setIsDrawingFreehand] = useState(false);
  const [snap2D, setSnap2D] = useState(true);
  const [drawName, setDrawName] = useState('Sketch');
  const [drawSpanMm, setDrawSpanMm] = useState(64);
  const [drawHeightMm, setDrawHeightMm] = useState(10);
  const [drawBevel, setDrawBevel] = useState(true);
  const [drawColor, setDrawColor] = useState('#e4e4e7');

  // SVG Import State
  const [rawSvgText, setRawSvgText] = useState<string>('');
  const [svgFileName, setSvgFileName] = useState<string>('Imported.svg');
  const [parsedSvg, setParsedSvg] = useState<ParsedSvg3DResult | null>(null);
  const [svgError, setSvgError] = useState<string | null>(null);
  const [showPasteSvg, setShowPasteSvg] = useState<boolean>(false);

  const getNormalizedSvgCoords = (
    e: React.PointerEvent<SVGSVGElement>
  ): [number, number] => {
    const svg = svgRef.current;
    if (!svg) return [0, 0];
    const rect = svg.getBoundingClientRect();
    let nx = (e.clientX - rect.left) / rect.width - 0.5;
    let nz = (e.clientY - rect.top) / rect.height - 0.5;
    nx = Math.max(-0.48, Math.min(0.48, nx));
    nz = Math.max(-0.48, Math.min(0.48, nz));
    if (snap2D && drawTool !== 'freehand') {
      nx = Math.round(nx * 20) / 20;
      nz = Math.round(nz * 20) / 20;
    } else {
      nx = Math.round(nx * 200) / 200;
      nz = Math.round(nz * 200) / 200;
    }
    return [nx, nz];
  };

  const handleSvgPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const [nx, nz] = getNormalizedSvgCoords(e);

    if (drawTool === 'hole') {
      const holeLoop: Array<[number, number]> = [];
      const r = 0.065;
      const segs = 14;
      for (let i = 0; i < segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        holeLoop.push([
          Math.round((nx + Math.cos(a) * r) * 1000) / 1000,
          Math.round((nz + Math.sin(a) * r) * 1000) / 1000,
        ]);
      }
      setHoles((prev) => [...prev, holeLoop]);
      return;
    }

    if (drawTool === 'polygon') {
      setOuterPoints((prev) => [...prev, [nx, nz]]);
    } else if (drawTool === 'freehand') {
      setIsDrawingFreehand(true);
      setOuterPoints([[nx, nz]]);
    }
  };

  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDrawingFreehand || drawTool !== 'freehand') return;
    const [nx, nz] = getNormalizedSvgCoords(e);
    setOuterPoints((prev) => {
      if (prev.length === 0) return [[nx, nz]];
      const [lx, lz] = prev[prev.length - 1];
      if (Math.hypot(nx - lx, nz - lz) < 0.03) return prev;
      return [...prev, [nx, nz]];
    });
  };

  const handleSvgPointerUp = () => {
    if (isDrawingFreehand) {
      setIsDrawingFreehand(false);
    }
  };

  const handleBuild2DShape = (saveToLibrary: boolean) => {
    if (outerPoints.length < 3 && drawMode === 'extrude') return;

    if (drawMode === 'revolve') {
      const profilePoints: Array<[number, number]> = outerPoints.map(
        ([x, z]) => [Math.max(0.04, Math.min(0.49, Math.abs(x))), -z]
      );
      const node: CustomModelSubNode = {
        id: `node-lathe-${Date.now()}`,
        name: drawName,
        nodeType: 'lathe',
        role: 'solid',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        dimensions: {
          width: drawSpanMm,
          height: drawHeightMm,
          depth: drawSpanMm,
        },
        color: drawColor,
        lathe: {
          profilePoints,
          segments: 36,
        },
      };
      onCreateFrom2DDrawing({
        name: drawName,
        mode: 'revolve',
        widthMm: drawSpanMm,
        heightMm: drawHeightMm,
        depthMm: drawSpanMm,
        color: drawColor,
        bevel: false,
        nodes: [node],
        saveToLibrary,
      });
    } else {
      const node: CustomModelSubNode = {
        id: `node-extrude-${Date.now()}`,
        name: drawName,
        nodeType: 'contour_extrude',
        role: 'solid',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        dimensions: {
          width: drawSpanMm,
          height: drawHeightMm,
          depth: drawSpanMm,
        },
        color: drawColor,
        contour: {
          outerLoop: outerPoints.map(([x, z]) => [x, -z]),
          holes: holes.map((h) => h.map(([x, z]) => [x, -z])),
          bevel: drawBevel,
        },
      };
      onCreateFrom2DDrawing({
        name: drawName,
        mode: 'extrude',
        widthMm: drawSpanMm,
        heightMm: drawHeightMm,
        depthMm: drawSpanMm,
        color: drawColor,
        bevel: drawBevel,
        nodes: [node],
        saveToLibrary,
      });
    }
  };

  // Handle importing an .svg file or raw SVG code
  const processSvgString = (svgContent: string, fileName: string) => {
    try {
      setSvgError(null);
      setRawSvgText(svgContent);
      setSvgFileName(fileName);
      const parsed = parseSvgTo3DNodes(
        svgContent,
        fileName,
        drawSpanMm,
        drawHeightMm,
        drawBevel,
        drawColor
      );
      setParsedSvg(parsed);
      setDrawName(parsed.name);

      // Also populate the 2D Draw Pad with the first shape so the user can even edit or punch holes in their SVG!
      if (parsed.nodes.length > 0 && parsed.nodes[0].contour) {
        setOuterPoints(
          parsed.nodes[0].contour.outerLoop.map(([x, z]) => [x, -z])
        );
        setHoles(
          (parsed.nodes[0].contour.holes || []).map((h) =>
            h.map(([x, z]) => [x, -z])
          )
        );
      }
    } catch (err) {
      setSvgError(String(err));
      setParsedSvg(null);
    }
  };

  const handleSvgFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    processSvgString(text, file.name);
    if (svgFileInputRef.current) svgFileInputRef.current.value = '';
  };

  const handleBuildSvg3D = (saveToLibrary: boolean) => {
    if (!rawSvgText.trim()) return;
    try {
      const freshParsed = parseSvgTo3DNodes(
        rawSvgText,
        drawName || svgFileName,
        drawSpanMm,
        drawHeightMm,
        drawBevel,
        drawColor
      );
      onCreateFrom2DDrawing({
        name: drawName.trim() || freshParsed.name,
        mode: 'svg',
        widthMm: freshParsed.suggestedDimensions.width,
        heightMm: freshParsed.suggestedDimensions.height,
        depthMm: freshParsed.suggestedDimensions.depth,
        color: drawColor,
        bevel: drawBevel,
        nodes: freshParsed.nodes,
        svgDataUrl: freshParsed.svgDataUrl,
        saveToLibrary,
      });
    } catch (err) {
      setSvgError(String(err));
    }
  };

  const tile = (active: boolean) =>
    `h-16 rounded-xl flex flex-col items-center justify-center gap-1.5 text-[12.5px] font-medium cursor-default transition-[background-color,color,transform] active:scale-[0.97] ${
      active
        ? 'bg-[#0d99ff] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]'
        : 'bg-white/[0.05] text-white/75 hover:bg-white/[0.09] hover:text-white'
    }`;

  /** Name, size, bevel and color fields shared by Sketch and SVG */
  const outputFields = (spanLabel: string) => (
    <>
      <TextInput value={drawName} onChange={(e) => setDrawName(e.target.value)} placeholder="Name" aria-label="Name" />
      <div className="grid grid-cols-2 gap-2">
        <NumberInput label="W" title={spanLabel} value={drawSpanMm} min={5} max={500} precision={0} onChange={(v) => setDrawSpanMm(v)} />
        <NumberInput
          label="T"
          title={drawMode === 'revolve' && subTab === 'draw2d' ? 'Height' : 'Thickness'}
          value={drawHeightMm}
          min={1}
          max={250}
          precision={1}
          onChange={(v) => setDrawHeightMm(v)}
        />
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {DRAW_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Color ${c}`}
              onClick={() => setDrawColor(c)}
              className={`w-5 h-5 rounded-full ring-1 ring-inset ring-white/20 cursor-default transition-transform ${
                drawColor === c ? 'outline-2 outline-offset-2 outline-[#0d99ff]' : 'hover:scale-110'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        {!(subTab === 'draw2d' && drawMode === 'revolve') && (
          <Switch label="Bevel" checked={drawBevel} onChange={setDrawBevel} />
        )}
      </div>
    </>
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="h-[44px] shrink-0 pl-[12px] pr-[8px] flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-white/90">{MODE_TITLES[subTab]}</h2>
        <Button variant="primary" size="sm" onClick={onDone}>
          Done
        </Button>
      </div>

      {/* ==================== SCULPT ==================== */}
      {subTab === 'clay' && (
        <div ref={setFadeEl} style={fadeStyle} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          <Section title="Brush">
            <div className="grid grid-cols-3 gap-1.5">
              {BRUSH_OPTIONS.map((b) => (
                <Tooltip key={b.id} label={b.desc} className="w-full">
                  <button
                    type="button"
                    onClick={() => onUpdateSculptSettings({ brush: b.id })}
                    className={`w-full h-9 rounded-lg text-[13px] font-medium cursor-default transition-colors ${
                      sculptSettings.brush === b.id
                        ? 'bg-[#0d99ff] text-white'
                        : 'bg-white/[0.05] text-white/70 hover:bg-white/[0.09] hover:text-white'
                    }`}
                  >
                    {b.label}
                  </button>
                </Tooltip>
              ))}
            </div>
            <Slider label="Size" min={3} max={50} value={sculptSettings.radiusMm} format={(v) => `${v} mm`} onChange={(v) => onUpdateSculptSettings({ radiusMm: v })} />
            <Slider label="Strength" min={0.1} max={1} step={0.05} value={sculptSettings.strength} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => onUpdateSculptSettings({ strength: v })} />
            <Switch label="Mirror X" checked={sculptSettings.symmetryX} onChange={(v) => onUpdateSculptSettings({ symmetryX: v })} />
            <Switch label="Mirror Z" checked={sculptSettings.symmetryZ} onChange={(v) => onUpdateSculptSettings({ symmetryZ: v })} />
            <p className="text-[12.5px] text-white/45">Drag on a part to sculpt. Hold ⌥ to invert.</p>
            {selectedPart && (
              <Button size="md" fullWidth icon={<Sparkles className="w-4 h-4" />} onClick={onSubdivideSelectedClay}>
                Subdivide
              </Button>
            )}
          </Section>

          <Section title="Add clay">
            <div className="grid grid-cols-4 gap-1.5">
              {CLAY_PRESETS.map((p) => (
                <button key={p.id} type="button" onClick={() => onAddClayPreset(p.id)} className={tile(false)}>
                  {p.icon}
                  <span>{p.label}</span>
                </button>
              ))}
            </div>
          </Section>
        </div>
      )}

      {/* ==================== SKETCH ==================== */}
      {subTab === 'draw2d' && (
        <div ref={setFadeEl} style={fadeStyle} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          <Section title="Outline">
            <SegmentedControl<'extrude' | 'revolve'>
              size="sm"
              value={drawMode}
              onChange={(m) => {
                setDrawMode(m);
                if (m === 'revolve' && drawTool === 'hole') setDrawTool('polygon');
              }}
              options={[
                { value: 'extrude', label: 'Extrude', title: 'Push the outline up into a solid' },
                { value: 'revolve', label: 'Revolve', title: 'Spin the outline around the center axis' },
              ]}
            />

            <div className="flex items-center gap-1">
              <IconButton icon={<PenTool className="w-4 h-4" />} title="Points — click to add corners" isActive={drawTool === 'polygon'} onClick={() => setDrawTool('polygon')} />
              <IconButton icon={<Pencil className="w-4 h-4" />} title="Freehand — drag to draw" isActive={drawTool === 'freehand'} onClick={() => setDrawTool('freehand')} />
              {drawMode === 'extrude' && (
                <IconButton icon={<CircleDot className="w-4 h-4" />} title="Hole — click inside the shape" isActive={drawTool === 'hole'} onClick={() => setDrawTool('hole')} />
              )}
              <div className="flex-1" />
              <IconButton icon={<Magnet className="w-4 h-4" />} title="Snap to grid" isToggled={snap2D} onClick={() => setSnap2D((s) => !s)} />
              <IconButton
                icon={<Minus className="w-4 h-4" />}
                title="Remove last point"
                disabled={outerPoints.length === 0}
                onClick={() => setOuterPoints((prev) => prev.slice(0, -1))}
              />
              <IconButton
                icon={<Eraser className="w-4 h-4" />}
                title="Clear"
                variant="danger"
                onClick={() => {
                  setOuterPoints([]);
                  setHoles([]);
                }}
              />
            </div>

            <div className="relative rounded-xl bg-black/30 ring-1 ring-inset ring-white/[0.06] aspect-square overflow-hidden">
              <svg
                ref={svgRef}
                viewBox="-0.5 -0.5 1 1"
                onPointerDown={handleSvgPointerDown}
                onPointerMove={handleSvgPointerMove}
                onPointerUp={handleSvgPointerUp}
                className="w-full h-full cursor-crosshair touch-none"
              >
                {[-0.4, -0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3, 0.4].map((g) => (
                  <React.Fragment key={g}>
                    <line x1={g} y1={-0.5} x2={g} y2={0.5} stroke={g === 0 ? '#3f3f46' : '#262626'} strokeWidth={g === 0 ? '0.004' : '0.0025'} />
                    <line x1={-0.5} y1={g} x2={0.5} y2={g} stroke={g === 0 ? '#3f3f46' : '#262626'} strokeWidth={g === 0 ? '0.004' : '0.0025'} />
                  </React.Fragment>
                ))}
                {drawMode === 'revolve' && (
                  <line x1={0} y1={-0.5} x2={0} y2={0.5} stroke="#0d99ff" strokeDasharray="0.02 0.015" strokeWidth="0.006" />
                )}
                {outerPoints.length >= 2 && (
                  <polygon
                    points={outerPoints.map(([x, z]) => `${x},${z}`).join(' ')}
                    fill="#0d99ff"
                    fillOpacity={0.18}
                    stroke="#0d99ff"
                    strokeWidth="0.008"
                    strokeLinejoin="round"
                  />
                )}
                {holes.map((hole, hIdx) => (
                  <polygon key={hIdx} points={hole.map(([x, z]) => `${x},${z}`).join(' ')} fill="#1b1b1b" stroke="#ef4444" strokeWidth="0.007" />
                ))}
                {outerPoints.map(([x, z], idx) => (
                  <circle key={idx} cx={x} cy={z} r={0.013} fill="#ffffff" stroke="#0d99ff" strokeWidth="0.006" />
                ))}
              </svg>
              <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none">
                <span className="glass-menu rounded-full px-2.5 h-6 flex items-center text-[12px] text-white/70">
                  {drawTool === 'polygon' ? 'Click to add corners' : drawTool === 'freehand' ? 'Drag to draw' : 'Click to add a hole'}
                </span>
                <span className="glass-menu rounded-full px-2.5 h-6 flex items-center text-[12px] text-white/50 tabular">
                  {outerPoints.length} pts{holes.length > 0 ? ` · ${holes.length} holes` : ''}
                </span>
              </div>
            </div>
          </Section>

          <Section title="Output">
            {outputFields(drawMode === 'revolve' ? 'Diameter' : 'Width')}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button size="md" disabled={outerPoints.length < 3} onClick={() => handleBuild2DShape(false)} icon={<Plus className="w-4 h-4" />}>
                Add
              </Button>
              <Button size="md" variant="primary" disabled={outerPoints.length < 3} onClick={() => handleBuild2DShape(true)}>
                Add & Save
              </Button>
            </div>
          </Section>
        </div>
      )}

      {/* ==================== SVG IMPORT ==================== */}
      {subTab === 'svg' && (
        <div ref={setFadeEl} style={fadeStyle} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          <Section
            title="Source"
            actions={
              <button
                type="button"
                onClick={() => setShowPasteSvg((v) => !v)}
                className="h-7 px-2 rounded-md text-[12.5px] text-white/55 hover:text-white hover:bg-white/[0.06] cursor-default"
              >
                {showPasteSvg ? 'Hide code' : 'Paste code'}
              </button>
            }
          >
            <input ref={svgFileInputRef} type="file" accept=".svg,image/svg+xml" onChange={handleSvgFileUpload} className="hidden" />
            <button
              type="button"
              onClick={() => svgFileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const file = e.dataTransfer?.files?.[0];
                if (file) processSvgString(await file.text(), file.name);
              }}
              className="w-full rounded-xl border border-dashed border-white/[0.14] hover:border-[#0d99ff]/60 hover:bg-[#0d99ff]/[0.04] py-6 flex flex-col items-center gap-2 cursor-default transition-colors"
            >
              <FileUp className="w-5 h-5 text-white/50" />
              <span className="text-[13.5px] text-white/85">Choose or drop an SVG</span>
              <span className="text-[12px] text-white/40">Paths, curves and holes become 3D</span>
            </button>

            {showPasteSvg && (
              <TextArea
                rows={4}
                value={rawSvgText}
                onChange={(e) => processSvgString(e.target.value, 'Pasted.svg')}
                placeholder='<svg viewBox="0 0 100 100">…</svg>'
                className="font-mono text-[12px]"
              />
            )}

            {svgError && (
              <p className="px-3 py-2 rounded-lg bg-red-500/10 text-[12.5px] text-red-300">
                Couldn’t read that SVG. {svgError.replace(/^Error:\s*/, '')}
              </p>
            )}

            {!parsedSvg && (
              <div>
                <div className="text-[12px] text-white/40 mb-1.5">Samples</div>
                <div className="flex flex-wrap gap-1.5">
                  {SAMPLE_ROBOTICS_SVGS.map((sample) => (
                    <button
                      key={sample.name}
                      type="button"
                      onClick={() => processSvgString(sample.svg, sample.name)}
                      className="h-7 px-3 rounded-full bg-white/[0.06] hover:bg-white/[0.1] text-[12.5px] text-white/70 hover:text-white cursor-default transition-colors"
                    >
                      {sample.name.replace('.svg', '')}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Section>

          {parsedSvg && (
            <Section title="Output">
              <div className="flex items-center gap-3">
                <img src={parsedSvg.svgDataUrl} alt="" className="w-14 h-14 rounded-lg bg-white p-1.5 object-contain shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] text-white/90 truncate">{parsedSvg.name}</div>
                  <div className="text-[12px] text-white/45 tabular">
                    {parsedSvg.shapeCount} {parsedSvg.shapeCount === 1 ? 'shape' : 'shapes'} · {parsedSvg.holeCount}{' '}
                    {parsedSvg.holeCount === 1 ? 'hole' : 'holes'}
                  </div>
                  <button type="button" onClick={() => setSubTab('draw2d')} className="text-[12.5px] text-[#5cb8ff] hover:underline cursor-default">
                    Edit in Sketch
                  </button>
                </div>
              </div>
              {outputFields('Width')}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Button size="md" onClick={() => handleBuildSvg3D(false)} icon={<Plus className="w-4 h-4" />}>
                  Add
                </Button>
                <Button size="md" variant="primary" onClick={() => handleBuildSvg3D(true)}>
                  Add & Save
                </Button>
              </div>
            </Section>
          )}
        </div>
      )}
    </div>
  );
};
