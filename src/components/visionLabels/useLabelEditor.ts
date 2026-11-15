import { useEffect, useState } from 'react';
import { errorMessage } from '../../utils/errorMessage';
import { putLabel, setLabelKeypoint } from '../../vision/labelEdits';
import { makeLabelGeometry } from '../../vision/labelEditsClient';
import type { ImageAnnotation } from '../../vision/frameSet';
import type { LabelTool } from './labelKeys';
import type { FrameLabelEditorProps, LabelPoint } from './labelEditorTypes';
import { useLabelDocument } from './useLabelDocument';
import { createLabelTasks } from './labelTasks';
import { labelGeometryInput, type LabelDrawingShape } from './labelGeometryInput';
import type { LabelEdit } from './labelDocumentHistory';

interface LabelTaskResult {
  edit: LabelEdit;
  label?: ImageAnnotation;
}

export function useLabelEditor(props: FrameLabelEditorProps) {
  const document = useLabelDocument(props);
  const [tasks] = useState(createLabelTasks);

  useEffect(() => {
    tasks.open();

    return tasks.close;
  }, [tasks]);

  const [tool, setTool] = useState<LabelTool>('select');
  const [pointName, setPointName] = useState('center');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { frame, classId, category, selected, label, select, edit, currentSet } = document;
  const attempt = (action: () => void) => {
    try {
      setError('');
      action();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };
  const run = (task: () => Promise<LabelTaskResult | null>) =>
    tasks.run({
      task,
      apply: (result) => {
        if (!result) return;

        edit(result.edit);

        if (result.label) select(result.label);
      },
      busy: (value) => {
        setBusy(value);

        if (value) setError('');
      },
      error: (cause) => setError(errorMessage(cause)),
    });
  const geometry = (shape: LabelDrawingShape) =>
    run(async () => {
      if (!frame || !category) return null;

      const annotation = await makeLabelGeometry(labelGeometryInput(shape, { frame, classId: category.id, label }));

      return { edit: (current) => putLabel(current, frame.id, annotation), label: annotation };
    });
  const point = (position: LabelPoint) =>
    attempt(() => {
      if (!frame || !label) return;

      edit((current) =>
        setLabelKeypoint(current, {
          frameId: frame.id,
          instance: label.instance,
          point: {
            name: pointName,
            x: Math.min(frame.width - 0.001, position[0]),
            y: Math.min(frame.height - 0.001, position[1]),
            visible: true,
          },
        }),
      );
    });
  const segment = (position: LabelPoint) =>
    run(async () => {
      if (!frame || !category || !props.onSegment) return null;

      const annotation = await props.onSegment({ frame, classId, instance: selected ?? undefined, point: position });

      if (!annotation) return null;

      return {
        edit: (current) => putLabel(current, frame.id, { ...annotation, review: 'suggested', source: 'model' }),
        label: annotation,
      };
    });
  const track = () =>
    run(async () => {
      if (!frame || !selected || !props.onTrack) return null;

      const tracked = await props.onTrack({ set: currentSet(), frameId: frame.id, instance: selected });

      return { edit: () => tracked };
    });
  const prelabel = () =>
    run(async () => {
      if (!props.onPrelabel) return null;

      const labelled = await props.onPrelabel(currentSet());

      return { edit: () => labelled };
    });

  return {
    ...document,
    tool,
    setTool,
    pointName,
    setPointName,
    busy,
    error,
    geometry,
    point,
    segment,
    track,
    prelabel,
    renameClass: (name: string) => attempt(() => document.renameClass(name)),
    addClass: (name: string) => attempt(() => document.addClass(name)),
    chooseClass: (id: number) => attempt(() => document.chooseClass(id)),
  };
}

export type LabelEditor = ReturnType<typeof useLabelEditor>;
