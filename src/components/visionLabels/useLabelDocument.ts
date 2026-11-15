import { useState } from 'react';
import { confirmAction } from '../../design-system/confirmStore';
import {
  acceptLabels,
  addLabelClass,
  createLabelHistory,
  deleteLabel,
  putLabel,
  renameLabelClass,
} from '../../vision/labelEdits';
import type { ImageAnnotation } from '../../vision/frameSet';
import type { FrameLabelEditorProps } from './labelEditorTypes';
import { createLabelDocumentHistory, type LabelEdit } from './labelDocumentHistory';

export function useLabelDocument(props: FrameLabelEditorProps) {
  const [document] = useState(() => createLabelDocumentHistory(props.set));
  const [history, setHistory] = useState(() => createLabelHistory(props.set));
  const [frameIndex, setFrameIndex] = useState(() =>
    Math.max(
      0,
      props.set.frames.findIndex((frame) => frame.id === props.initialFrameId),
    ),
  );
  const [selectedClassId, setClassId] = useState(props.set.classes[0]?.id ?? -1);
  const [selected, setSelected] = useState<string | null>(null);
  const set = history.present;
  const frame = set.frames[frameIndex];
  const label = frame?.annotations.find((annotation) => annotation.instance === selected);
  const category = set.classes.find((entry) => entry.id === selectedClassId) ?? set.classes[0];
  const classId = category?.id ?? -1;
  const publish = (next: typeof history) => {
    setHistory(next);
    props.onChange(next.present);
  };
  const edit = (operation: LabelEdit) => publish(document.edit(operation));
  const select = (annotation: ImageAnnotation) => {
    setSelected(annotation.instance);
    setClassId(annotation.classId);
  };
  const navigate = (delta: number) => {
    setFrameIndex(Math.max(0, Math.min(set.frames.length - 1, frameIndex + delta)));
    setSelected(null);
  };
  const remove = () => {
    if (!frame || !label) return;

    confirmAction({
      title: `Delete ${set.classes.find((entry) => entry.id === label.classId)?.name ?? label.instance}?`,
      onConfirm: () => {
        edit((current) => deleteLabel(current, frame.id, label.instance));
        setSelected(null);
      },
    });
  };
  const accept = () => {
    if (frame) edit((current) => acceptLabels(current, frame.id, selected ?? undefined));
  };
  const addClass = (name: string) => {
    const next = document.edit((current) => addLabelClass(current, name));

    publish(next);
    setClassId(next.present.classes.at(-1)!.id);
  };
  const chooseClass = (id: number) => {
    setClassId(id);

    if (!frame || !label) return;

    edit((current) =>
      putLabel(current, frame.id, { ...label, classId: id, keypoints: [], source: 'manual', review: 'accepted' }),
    );
  };

  return {
    set,
    frame,
    frameIndex,
    classId,
    category,
    selected,
    label,
    select,
    setSelected,
    navigate,
    edit,
    currentSet: document.current,
    remove,
    accept,
    undo: () => publish(document.undo()),
    redo: () => publish(document.redo()),
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    renameClass: (name: string) => edit((current) => renameLabelClass(current, classId, name)),
    addClass,
    chooseClass,
  };
}
