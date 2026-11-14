import React, { useState } from 'react';
import { ModeHeader, useScrollFade } from '../design-system';
import type { ScenePart, SculptSettings } from '../types/robotics';
import type { SketchShape } from '../utils/sketch/placement';
import type { Sketch } from '../utils/sketch/types';
import type { SketchParams } from '../workspace/partFactories';
import type { TextFile } from '../workspace/types';
import { SculptPanel } from './studio/SculptPanel';
import { SketchPanel, type BoundSketch, type SketchLinkage, type SketchOutput } from './studio/SketchPanel';
import { SvgImportPanel } from './studio/SvgImportPanel';
import { useStudioDraft } from './studio/useStudioDraft';

export type StudioSubTab = 'clay' | 'draw2d' | 'svg';

const MODE_TITLES: Record<StudioSubTab, string> = { clay: 'Sculpt', draw2d: 'Sketch', svg: 'Import SVG' };

interface SculptAndDrawStudioProps {
  selectedPart: ScenePart | null;
  sculptSettings: SculptSettings;
  mode: StudioSubTab;
  svgFile?: TextFile | null;
  onChangeMode: (mode: StudioSubTab) => void;
  onDone: () => void;
  onUpdateSculptSettings: (patch: Partial<SculptSettings>) => void;
  onAddClayPreset: (preset: 'clay_sphere' | 'clay_box' | 'clay_cylinder' | 'clay_capsule') => void;
  onSubdivideSelectedClay: () => void;
  onCreateFrom2DDrawing: (params: SketchParams) => void;
  sketchStart: Sketch;
  boundSketch: BoundSketch | null;
  linkage?: SketchLinkage;
  onCreateSketch: (shape: SketchShape, output: SketchOutput) => void;
}

export const SculptAndDrawStudio: React.FC<SculptAndDrawStudioProps> = ({
  selectedPart,
  sculptSettings,
  mode: subTab,
  svgFile = null,
  onChangeMode: setSubTab,
  onDone,
  onUpdateSculptSettings,
  onAddClayPreset,
  onSubdivideSelectedClay,
  onCreateFrom2DDrawing,
  sketchStart,
  boundSketch,
  linkage,
  onCreateSketch,
}) => {
  const { ref: setFadeEl, style: fadeStyle } = useScrollFade();
  const draft = useStudioDraft(sketchStart, boundSketch ? null : 'line');
  const [loadedSvg, setLoadedSvg] = useState<TextFile | null>(null);

  if (svgFile && svgFile !== loadedSvg) {
    setLoadedSvg(svgFile);
    draft.processSvgString(svgFile.text, svgFile.name);
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <ModeHeader title={MODE_TITLES[subTab]} onDone={onDone} />

      <div key={subTab} ref={setFadeEl} style={fadeStyle} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        {subTab === 'clay' && (
          <SculptPanel
            sculptSettings={sculptSettings}
            canSubdivide={!!selectedPart?.sculptMesh}
            onUpdateSculptSettings={onUpdateSculptSettings}
            onAddClayPreset={onAddClayPreset}
            onSubdivideSelectedClay={onSubdivideSelectedClay}
          />
        )}
        {subTab === 'draw2d' && (
          <SketchPanel draft={draft} bound={boundSketch} linkage={linkage} onCreate={onCreateSketch} />
        )}
        {subTab === 'svg' && (
          <SvgImportPanel
            draft={draft}
            onEditInSketch={() => setSubTab('draw2d')}
            onCreateFrom2DDrawing={onCreateFrom2DDrawing}
          />
        )}
      </div>
    </div>
  );
};
