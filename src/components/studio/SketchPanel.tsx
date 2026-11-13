import React from 'react';
import {
  ArcIcon,
  Button,
  CircleIcon,
  EraserIcon,
  IconButton,
  MagnetIcon,
  PlusIcon,
  RectangleIcon,
  Section,
  SegmentedControl,
  SlashIcon,
  confirmAction,
} from '../../design-system';
import { sketchProfile } from '../../utils/sketch/profile';
import type { SketchShape } from '../../utils/sketch/placement';
import type { PartSketch, Sketch, SketchMode } from '../../utils/sketch/types';
import { OutputFields } from './OutputFields';
import { ThicknessField } from './ThicknessField';
import { SketchCanvas } from './SketchCanvas';
import type { SketchEditor } from './useSketchDrawing';
import type { SketchTool, StudioDraft } from './useStudioDraft';

export interface BoundSketch {
  record: PartSketch;
  onChange: (next: Partial<SketchShape>) => void;
  undo: () => void;
  redo: () => void;
}

export interface SketchOutput {
  name: string;
  color: string;
}

const TOOLS: Array<{ tool: SketchTool; title: string; icon: React.ReactNode }> = [
  { tool: 'line', title: 'Line', icon: <SlashIcon className="w-4 h-4" /> },
  { tool: 'rect', title: 'Rectangle', icon: <RectangleIcon className="w-4 h-4" /> },
  { tool: 'circle', title: 'Circle', icon: <CircleIcon className="w-4 h-4" /> },
  { tool: 'arc', title: 'Arc', icon: <ArcIcon className="w-4 h-4" /> },
];

const SketchTools: React.FC<{ draft: StudioDraft; bound: boolean; onClear: () => void }> = ({
  draft,
  bound,
  onClear,
}) => (
  <div className="flex items-center gap-1">
    {TOOLS.map(({ tool, title, icon }) => (
      <IconButton
        key={tool}
        icon={icon}
        title={title}
        isActive={draft.drawTool === tool}
        onClick={() => draft.setDrawTool(draft.drawTool === tool ? null : tool)}
      />
    ))}
    <div className="flex-1" />
    <IconButton
      icon={<MagnetIcon className="w-4 h-4" />}
      title="Snap to grid"
      isToggled={draft.snap2D}
      onClick={() => draft.setSnap2D((s) => !s)}
    />
    {!bound && (
      <IconButton
        icon={<EraserIcon className="w-4 h-4" />}
        title="Clear"
        variant="danger"
        onClick={() => confirmAction({ title: 'Clear sketch?', confirmLabel: 'Clear', onConfirm: onClear })}
      />
    )}
  </div>
);

const MODE_OPTIONS = [
  { value: 'extrude' as const, label: 'Extrude', title: 'Push the outline up into a solid' },
  { value: 'revolve' as const, label: 'Revolve', title: 'Spin the outline around the center axis' },
];

const clearedSketch = (sketch: Sketch): Sketch => ({
  points: sketch.points.filter((p) => p.fixed),
  entities: sketch.entities.filter((e) => e.kind === 'line' && e.ref),
  constraints: [],
});

export const SketchPanel: React.FC<{
  draft: StudioDraft;
  bound: BoundSketch | null;
  onCreate: (shape: SketchShape, output: SketchOutput) => void;
}> = ({ draft, bound, onCreate }) => {
  const mode: SketchMode = bound ? bound.record.mode : draft.drawMode;
  const editor: SketchEditor = bound
    ? { sketch: bound.record.sketch, apply: (sketch) => bound.onChange({ sketch }), undo: bound.undo, redo: bound.redo }
    : { sketch: draft.sketch, apply: draft.apply, undo: draft.undo, redo: draft.redo };
  const closed = !!sketchProfile(editor.sketch);

  const build = () =>
    onCreate(
      { sketch: draft.sketch, mode, depth: draft.drawHeightMm },
      { name: draft.drawName, color: draft.drawColor },
    );

  return (
    <>
      <Section title="Outline">
        <SegmentedControl<SketchMode>
          size="sm"
          value={mode}
          onChange={(m) => (bound ? bound.onChange({ mode: m }) : draft.setDrawMode(m))}
          options={MODE_OPTIONS}
        />
        <SketchTools draft={draft} bound={!!bound} onClear={() => draft.apply(clearedSketch(draft.sketch))} />
        <SketchCanvas editor={editor} tool={draft.drawTool} onTool={draft.setDrawTool} snap={draft.snap2D} />
      </Section>

      {(!bound || mode === 'extrude') && (
        <Section title="Output">
          {bound && (
            <ThicknessField value={bound.record.depth} min={-250} onChange={(depth) => bound.onChange({ depth })} />
          )}
          {!bound && <OutputFields draft={draft} depth={mode === 'extrude'} />}
          {!bound && (
            <Button
              size="md"
              variant="primary"
              fullWidth
              className="mt-1"
              disabled={!closed}
              onClick={build}
              icon={<PlusIcon className="w-4 h-4" />}
            >
              Add
            </Button>
          )}
        </Section>
      )}
    </>
  );
};
