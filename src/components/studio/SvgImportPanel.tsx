import React, { useRef } from 'react';
import { Button, Section, TextArea, FileImportIcon, PlusIcon } from '../../design-system';
import { parseSvgTo3DNodes, type ParsedSvg3DResult } from '../../utils/svgTo3DParser';
import { OutputFields } from './OutputFields';
import { SAMPLE_ROBOTICS_SVGS } from './samples';
import type { CreateFrom2DDrawingParams } from './sketchGeometry';
import type { StudioDraft } from './useStudioDraft';

const SvgSource: React.FC<{ draft: StudioDraft }> = ({ draft }) => {
  const svgFileInputRef = useRef<HTMLInputElement | null>(null);
  const { processSvgString, showPasteSvg, svgError } = draft;

  const handleSvgFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (!file) return;

    const text = await file.text();

    processSvgString(text, file.name);

    if (svgFileInputRef.current) svgFileInputRef.current.value = '';
  };

  return (
    <Section
      title="Source"
      actions={
        <button
          type="button"
          onClick={() => draft.setShowPasteSvg((v) => !v)}
          className="h-7 px-2 rounded-md text-[12.5px] text-white/55 hover:text-white hover:bg-white/[0.06] cursor-default"
        >
          {showPasteSvg ? 'Hide code' : 'Paste code'}
        </button>
      }
    >
      <input
        ref={svgFileInputRef}
        type="file"
        accept=".svg,image/svg+xml"
        onChange={handleSvgFileUpload}
        className="hidden"
      />
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
        <FileImportIcon className="w-5 h-5 text-white/50" />
        <span className="text-[13.5px] text-white/85">Choose or drop an SVG</span>
        <span className="text-[12px] text-white/40">Paths, curves and holes become 3D</span>
      </button>

      {showPasteSvg && (
        <TextArea
          rows={4}
          value={draft.rawSvgText}
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

      {!draft.parsedSvg && (
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
  );
};

const SvgOutput: React.FC<{
  draft: StudioDraft;
  parsedSvg: ParsedSvg3DResult;
  onEditInSketch: () => void;
  onCreateFrom2DDrawing: (params: CreateFrom2DDrawingParams) => void;
}> = ({ draft, parsedSvg, onEditInSketch, onCreateFrom2DDrawing }) => {
  const { rawSvgText, drawName, svgFileName, drawSpanMm, drawHeightMm, drawBevel, drawColor } = draft;

  const handleBuildSvg3D = (saveToLibrary: boolean) => {
    if (!rawSvgText.trim()) return;

    try {
      const freshParsed = parseSvgTo3DNodes(rawSvgText, {
        fileName: drawName || svgFileName,
        targetSpanMm: drawSpanMm,
        extrudeHeightMm: drawHeightMm,
        bevel: drawBevel,
        overrideColor: drawColor,
      });

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
      draft.setSvgError(String(err));
    }
  };

  return (
    <Section title="Output">
      <div className="flex items-center gap-3">
        <img
          src={parsedSvg.svgDataUrl}
          alt=""
          className="w-14 h-14 rounded-lg bg-white p-1.5 object-contain shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] text-white/90 truncate">{parsedSvg.name}</div>
          <div className="text-[12px] text-white/45 tabular">
            {parsedSvg.shapeCount} {parsedSvg.shapeCount === 1 ? 'shape' : 'shapes'} · {parsedSvg.holeCount}{' '}
            {parsedSvg.holeCount === 1 ? 'hole' : 'holes'}
          </div>
          <button
            type="button"
            onClick={onEditInSketch}
            className="text-[12.5px] text-[#5cb8ff] hover:underline cursor-default"
          >
            Edit in Sketch
          </button>
        </div>
      </div>
      <OutputFields draft={draft} spanLabel="Width" revolve={false} />
      <div className="grid grid-cols-2 gap-2 pt-1">
        <Button size="md" onClick={() => handleBuildSvg3D(false)} icon={<PlusIcon className="w-4 h-4" />}>
          Add
        </Button>
        <Button size="md" variant="primary" onClick={() => handleBuildSvg3D(true)}>
          Add & Save
        </Button>
      </div>
    </Section>
  );
};

export const SvgImportPanel: React.FC<{
  draft: StudioDraft;
  onEditInSketch: () => void;
  onCreateFrom2DDrawing: (params: CreateFrom2DDrawingParams) => void;
}> = ({ draft, onEditInSketch, onCreateFrom2DDrawing }) => (
  <>
    <SvgSource draft={draft} />
    {draft.parsedSvg && (
      <SvgOutput
        draft={draft}
        parsedSvg={draft.parsedSvg}
        onEditInSketch={onEditInSketch}
        onCreateFrom2DDrawing={onCreateFrom2DDrawing}
      />
    )}
  </>
);
