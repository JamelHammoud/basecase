import React from 'react';
import { Button, useScrollFade } from '../design-system';
import { CustomModelSubNode, ScenePart, SculptSettings } from '../types/robotics';
import { SculptPanel } from './studio/SculptPanel';
import { SketchPanel } from './studio/SketchPanel';
import { SvgImportPanel } from './studio/SvgImportPanel';
import { useStudioDraft } from './studio/useStudioDraft';

export type StudioSubTab = 'clay' | 'draw2d' | 'svg';

const MODE_TITLES: Record<StudioSubTab, string> = { clay: 'Sculpt', draw2d: 'Sketch', svg: 'Import SVG' };

interface SculptAndDrawStudioProps {
  selectedPart: ScenePart | null;
  sculptSettings: SculptSettings;
  mode: StudioSubTab;
  onChangeMode: (mode: StudioSubTab) => void;
  onDone: () => void;
  onUpdateSculptSettings: (patch: Partial<SculptSettings>) => void;
  onAddClayPreset: (preset: 'clay_sphere' | 'clay_box' | 'clay_cylinder' | 'clay_capsule') => void;
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
  const draft = useStudioDraft();

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="h-[44px] shrink-0 pl-[12px] pr-[8px] flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-white/90">{MODE_TITLES[subTab]}</h2>
        <Button variant="primary" size="sm" onClick={onDone}>
          Done
        </Button>
      </div>

      <div key={subTab} ref={setFadeEl} style={fadeStyle} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        {subTab === 'clay' && (
          <SculptPanel
            sculptSettings={sculptSettings}
            hasSelection={!!selectedPart}
            onUpdateSculptSettings={onUpdateSculptSettings}
            onAddClayPreset={onAddClayPreset}
            onSubdivideSelectedClay={onSubdivideSelectedClay}
          />
        )}
        {subTab === 'draw2d' && <SketchPanel draft={draft} onCreateFrom2DDrawing={onCreateFrom2DDrawing} />}
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
