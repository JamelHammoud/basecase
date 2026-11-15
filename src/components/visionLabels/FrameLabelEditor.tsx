import React from 'react';
import { Modal } from '../../design-system/Modal';
import { Button } from '../../design-system/Button';
import { IconButton } from '../../design-system/IconButton';
import { ChevronLeftIcon, ChevronRightIcon } from '../../design-system/glyphs';
import { Spinner } from '../../design-system/Spinner';
import { labelKeyAction } from './labelKeys';
import { useLabelEditor } from './useLabelEditor';
import { useLabelDrawing } from './useLabelDrawing';
import type { FrameLabelEditorProps } from './labelEditorTypes';
import FrameLabelCanvas from './FrameLabelCanvas';
import LabelClassPanel from './LabelClassPanel';
import LabelList from './LabelList';
import LabelTools from './LabelTools';

export type { FrameLabelEditorProps, SegmentLabelRequest, TrackLabelRequest } from './labelEditorTypes';

export default function FrameLabelEditor(props: FrameLabelEditorProps) {
  const editor = useLabelEditor(props);
  const drawing = useLabelDrawing(editor);
  const chooseTool = (tool: typeof editor.tool) => {
    drawing.reset();
    editor.setTool(tool);
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape' && !drawing.points.length) return;

    event.stopPropagation();

    if ((event.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]') || editor.busy)
      return;

    if (event.key === 'Enter' && (event.target as HTMLElement).closest('button')) return;

    if (event.key === 'Escape') {
      drawing.reset();

      return;
    }

    const action = labelKeyAction(event);

    if (!action) return;

    event.preventDefault();

    const commands: Record<string, () => void> = {
      next: () => {
        drawing.reset();
        editor.navigate(1);
      },
      previous: () => {
        drawing.reset();
        editor.navigate(-1);
      },
      undo: editor.undo,
      redo: editor.redo,
      finish: drawing.finish,
      delete: editor.remove,
      accept: editor.accept,
    };

    if (commands[action]) {
      commands[action]();

      return;
    }

    if (action === 'segment' && !props.onSegment) return;

    chooseTool(action as typeof editor.tool);
  };

  return (
    <Modal isOpen onClose={props.onClose} title="Frame labels" maxWidth="max-w-[1280px]">
      <div onKeyDown={onKeyDown} className="flex flex-col gap-3 h-[65vh]">
        <div className="flex items-center justify-between gap-3">
          <LabelTools editor={editor} segmentation={Boolean(props.onSegment)} onToolChange={chooseTool} />
          <div className="flex items-center gap-2 text-[13px] text-white/60 tabular-nums">
            {editor.busy && <Spinner className="w-4 h-4" />}
            <IconButton
              title="Previous frame"
              shortcut="←"
              icon={<ChevronLeftIcon className="w-4 h-4" />}
              disabled={editor.busy || editor.frameIndex === 0}
              onClick={() => {
                drawing.reset();
                editor.navigate(-1);
              }}
            />
            <span>
              {editor.frameIndex + 1} / {editor.set.frames.length}
            </span>
            <IconButton
              title="Next frame"
              shortcut="→"
              icon={<ChevronRightIcon className="w-4 h-4" />}
              disabled={editor.busy || editor.frameIndex >= editor.set.frames.length - 1}
              onClick={() => {
                drawing.reset();
                editor.navigate(1);
              }}
            />
          </div>
        </div>
        <div className="flex gap-3 flex-1 min-h-0">
          <div className="flex-1 min-w-0 rounded-xl bg-[#1b1b1b] overflow-hidden">
            <FrameLabelCanvas editor={editor} drawing={drawing} />
          </div>
          <aside className="w-[240px] shrink-0 space-y-5 overflow-y-auto">
            {props.onPrelabel && (
              <Button fullWidth disabled={editor.busy} onClick={() => void editor.prelabel()}>
                See Objects
              </Button>
            )}
            <LabelClassPanel editor={editor} />
            <LabelList editor={editor} />
            {editor.tool === 'polygon' && drawing.points.length >= 3 && (
              <Button fullWidth shortcut="↩" disabled={editor.busy} onClick={drawing.finish}>
                Finish Polygon
              </Button>
            )}
            {props.onTrack && editor.label && (
              <Button fullWidth disabled={editor.busy} onClick={() => void editor.track()}>
                Track Forward
              </Button>
            )}
            {editor.error && (
              <p role="alert" className="text-[13px] text-red-400">
                {editor.error}
              </p>
            )}
          </aside>
        </div>
      </div>
    </Modal>
  );
}
