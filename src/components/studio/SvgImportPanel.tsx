import React, { useRef } from 'react';
import { Button, MetaLine, Section, TextArea, FileImportIcon, PlusIcon } from '../../design-system';
import { parseSvgTo3DNodes, type ParsedSvg3DResult } from '../../utils/svgTo3DParser';
import { OutputFields } from './OutputFields';
import { SAMPLE_ROBOTICS_SVGS } from './samples';
import type { SketchParams as CreateFrom2DDrawingParams } from '../../workspace/partFactories';
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
        <Button variant="ghost" size="xs" onClick={() => draft.setShowPasteSvg((v) => !v)}>
          {showPasteSvg ? 'Hide Code' : 'Paste Code'}
        </Button>
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
          <div className="text-[12px] text-white/50 mb-1.5">Samples</div>
          <div className="flex flex-wrap gap-1.5">
            {SAMPLE_ROBOTICS_SVGS.map((sample) => (
              <Button key={sample.name} size="xs" onClick={() => processSvgString(sample.svg, sample.name)}>
                {sample.name.replace('.svg', '')}
              </Button>
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

  const handleBuildSvg3D = () => {
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
        <MetaLine
          className="min-w-0 flex-1 text-[13px] text-white/70 tabular"
          items={[
            `${parsedSvg.shapeCount} ${parsedSvg.shapeCount === 1 ? 'shape' : 'shapes'}`,
            parsedSvg.holeCount > 0 && `${parsedSvg.holeCount} ${parsedSvg.holeCount === 1 ? 'hole' : 'holes'}`,
          ]}
        />
        <Button variant="ghost" size="xs" onClick={onEditInSketch}>
          Edit in Sketch
        </Button>
      </div>
      <OutputFields draft={draft} depth svg />
      <Button
        size="md"
        variant="primary"
        fullWidth
        className="mt-1"
        onClick={handleBuildSvg3D}
        icon={<PlusIcon className="w-4 h-4" />}
      >
        Add
      </Button>
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
