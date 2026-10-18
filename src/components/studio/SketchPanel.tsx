import React from 'react';
import { CircleDot, Eraser, Magnet, Minus, Pencil, PenTool, Plus } from 'lucide-react';
import { Button, IconButton, Section, SegmentedControl } from '../../design-system';
import { OutputFields } from './OutputFields';
import { SketchCanvas } from './SketchCanvas';
import { sketchDrawing, type CreateFrom2DDrawingParams, type SketchMode } from './sketchGeometry';
import type { StudioDraft } from './useStudioDraft';

const SketchTools: React.FC<{ draft: StudioDraft }> = ({ draft }) => {
  const { drawMode, drawTool, setDrawTool, snap2D, outerPoints } = draft;

  return (
    <div className="flex items-center gap-1">
      <IconButton
        icon={<PenTool className="w-4 h-4" />}
        title="Points — click to add corners"
        isActive={drawTool === 'polygon'}
        onClick={() => setDrawTool('polygon')}
      />
      <IconButton
        icon={<Pencil className="w-4 h-4" />}
        title="Freehand — drag to draw"
        isActive={drawTool === 'freehand'}
        onClick={() => setDrawTool('freehand')}
      />
      {drawMode === 'extrude' && (
        <IconButton
          icon={<CircleDot className="w-4 h-4" />}
          title="Hole — click inside the shape"
          isActive={drawTool === 'hole'}
          onClick={() => setDrawTool('hole')}
        />
      )}
      <div className="flex-1" />
      <IconButton
        icon={<Magnet className="w-4 h-4" />}
        title="Snap to grid"
        isToggled={snap2D}
        onClick={() => draft.setSnap2D((s) => !s)}
      />
      <IconButton
        icon={<Minus className="w-4 h-4" />}
        title="Remove last point"
        disabled={outerPoints.length === 0}
        onClick={() => draft.setOuterPoints((prev) => prev.slice(0, -1))}
      />
      <IconButton
        icon={<Eraser className="w-4 h-4" />}
        title="Clear"
        variant="danger"
        onClick={() => {
          draft.setOuterPoints([]);
          draft.setHoles([]);
        }}
      />
    </div>
  );
};

export const SketchPanel: React.FC<{
  draft: StudioDraft;
  onCreateFrom2DDrawing: (params: CreateFrom2DDrawingParams) => void;
}> = ({ draft, onCreateFrom2DDrawing }) => {
  const { drawMode, drawTool, outerPoints } = draft;

  const build = (saveToLibrary: boolean) => {
    if (outerPoints.length < 3 && drawMode === 'extrude') return;

    onCreateFrom2DDrawing(
      sketchDrawing({
        mode: drawMode,
        outerPoints,
        holes: draft.holes,
        output: {
          name: draft.drawName,
          spanMm: draft.drawSpanMm,
          heightMm: draft.drawHeightMm,
          bevel: draft.drawBevel,
          color: draft.drawColor,
        },
        saveToLibrary,
        now: Date.now(),
      }),
    );
  };

  return (
    <>
      <Section title="Outline">
        <SegmentedControl<SketchMode>
          size="sm"
          value={drawMode}
          onChange={(m) => {
            draft.setDrawMode(m);

            if (m === 'revolve' && drawTool === 'hole') draft.setDrawTool('polygon');
          }}
          options={[
            { value: 'extrude', label: 'Extrude', title: 'Push the outline up into a solid' },
            { value: 'revolve', label: 'Revolve', title: 'Spin the outline around the center axis' },
          ]}
        />

        <SketchTools draft={draft} />

        <SketchCanvas draft={draft} />
      </Section>

      <Section title="Output">
        <OutputFields
          draft={draft}
          spanLabel={drawMode === 'revolve' ? 'Diameter' : 'Width'}
          revolve={drawMode === 'revolve'}
        />
        <div className="grid grid-cols-2 gap-2 pt-1">
          <Button
            size="md"
            disabled={outerPoints.length < 3}
            onClick={() => build(false)}
            icon={<Plus className="w-4 h-4" />}
          >
            Add
          </Button>
          <Button size="md" variant="primary" disabled={outerPoints.length < 3} onClick={() => build(true)}>
            Add & Save
          </Button>
        </div>
      </Section>
    </>
  );
};
