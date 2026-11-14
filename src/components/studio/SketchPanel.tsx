import React, { useState } from 'react';
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
import type { LinkageSolution, Vec2 } from '../../utils/linkage';
import { sketchProfile } from '../../utils/sketch/profile';
import type { SketchShape } from '../../utils/sketch/placement';
import type { PartSketch, Sketch } from '../../utils/sketch/types';
import { LinkageChoices } from './LinkageChoices';
import { OutputFields } from './OutputFields';
import { ThicknessField } from './ThicknessField';
import { SketchCanvas } from './SketchCanvas';
import type { SketchEditor } from './useSketchDrawing';
import { useLinkageSolutions } from './useLinkageSolutions';
import { usePathHistory } from './usePathHistory';
import { isDrawn, type SketchPanelMode, type SketchTool, type StudioDraft } from './useStudioDraft';

export interface BoundSketch {
  record: PartSketch;
  onChange: (next: Partial<SketchShape>) => void;
  undo: () => void;
  redo: () => void;
}

export interface SketchLinkage {
  path: Vec2[];
  setPath: (path: Vec2[]) => void;
  insert: (solution: LinkageSolution) => void;
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

const SketchTools: React.FC<{ draft: StudioDraft; bound: boolean; path: boolean; onClear: () => void }> = ({
  draft,
  bound,
  path,
  onClear,
}) => (
  <div className="flex items-center gap-1">
    {TOOLS.filter(() => !path).map(({ tool, title, icon }) => (
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

const MODE_OPTIONS: Array<{ value: SketchPanelMode; label: string }> = [
  { value: 'extrude', label: 'Extrude' },
  { value: 'revolve', label: 'Revolve' },
];

const PATH_OPTION = { value: 'path' as const, label: 'Path' };

const NO_PATH: Vec2[] = [];
const ignorePath = () => {};

const clearedSketch = (sketch: Sketch): Sketch => ({
  points: sketch.points.filter((p) => p.fixed),
  entities: sketch.entities.filter((e) => !isDrawn(e)),
  constraints: [],
});

function usePathMode(pathing: SketchLinkage | null) {
  const solved = useLinkageSolutions(pathing?.path ?? NO_PATH);
  const [highlighted, setHighlighted] = useState(0);
  const editor = usePathHistory(pathing?.path ?? NO_PATH, pathing?.setPath ?? ignorePath);

  if (!pathing) return { canvas: undefined, choices: null, clear: null };

  return {
    canvas: { editor, ...solved, highlighted },
    clear: () => {
      if (editor.points.length) editor.onChange([]);
    },
    choices: solved.solutions.length > 0 && (
      <LinkageChoices
        solutions={solved.solutions}
        highlighted={highlighted}
        onHighlight={setHighlighted}
        onPick={pathing.insert}
      />
    ),
  };
}

export const SketchPanel: React.FC<{
  draft: StudioDraft;
  bound: BoundSketch | null;
  linkage?: SketchLinkage;
  onCreate: (shape: SketchShape, output: SketchOutput) => void;
}> = ({ draft, bound, linkage, onCreate }) => {
  const mode: SketchPanelMode = bound ? bound.record.mode : draft.drawMode;
  const pathing = mode === 'path' && linkage ? linkage : null;
  const path = usePathMode(pathing);
  const editor: SketchEditor = bound
    ? { sketch: bound.record.sketch, apply: (sketch) => bound.onChange({ sketch }), undo: bound.undo, redo: bound.redo }
    : { sketch: draft.sketch, apply: draft.apply, undo: draft.undo, redo: draft.redo };
  const closed = !!sketchProfile(editor.sketch);

  const build = () =>
    mode !== 'path' &&
    onCreate(
      { sketch: draft.sketch, mode, depth: draft.drawHeightMm },
      { name: draft.drawName, color: draft.drawColor },
    );

  const changeMode = (m: SketchPanelMode) => {
    if (!bound) draft.setDrawMode(m);
    else if (m !== 'path') bound.onChange({ mode: m });
  };

  const clear = () => (path.clear ? path.clear() : draft.apply(clearedSketch(draft.sketch)));

  return (
    <>
      <Section title="Outline">
        <SegmentedControl<SketchPanelMode>
          size="sm"
          value={mode}
          onChange={changeMode}
          options={bound || !linkage ? MODE_OPTIONS : [...MODE_OPTIONS, PATH_OPTION]}
        />
        <SketchTools draft={draft} bound={!!bound} path={!!pathing} onClear={clear} />
        <SketchCanvas
          editor={editor}
          tool={draft.drawTool}
          onTool={draft.setDrawTool}
          snap={draft.snap2D}
          path={path.canvas}
        />
        {path.choices}
      </Section>

      {!pathing && (!bound || mode === 'extrude') && (
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
