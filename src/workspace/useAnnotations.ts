import { useState } from 'react';
import type { AnnotationDraft } from '../components/Annotations';
import type { SceneAnnotation, ScenePart } from '../types/robotics';
import { newId, stamp } from './helpers';
import type { Setter, ShowToast, Vec3 } from './types';

interface AnnotationOptions {
  initial: SceneAnnotation[];
  parts: ScenePart[];
  showToast: ShowToast;
  setSelectedIds: Setter<string[]>;
  stopTools: () => void;
}

type AnnotationUpdate = (a: SceneAnnotation) => SceneAnnotation | null;

function newThread(draft: AnnotationDraft, part: ScenePart | undefined, text: string): SceneAnnotation {
  const [x, y, z] = draft.position;

  return {
    id: newId('note'),
    position: draft.position,
    partId: part?.id ?? null,
    offset: part ? [x - part.position[0], y - part.position[1], z - part.position[2]] : undefined,
    comments: [{ id: newId('c'), text, createdAt: stamp() }],
    createdAt: stamp(),
  };
}

function useCommentEdits(setAnnotations: Setter<SceneAnnotation[]>) {
  'use memo';

  const updateAnnotation = (id: string, fn: AnnotationUpdate) =>
    setAnnotations((prev) =>
      prev.flatMap((a) => {
        if (a.id !== id) return [a];

        const next = fn(a);

        return next ? [next] : [];
      }),
    );

  const reply = (id: string, text: string) =>
    updateAnnotation(id, (a) => ({ ...a, comments: [...a.comments, { id: newId('c'), text, createdAt: stamp() }] }));

  const editComment = (id: string, commentId: string, text: string) =>
    updateAnnotation(id, (a) => ({
      ...a,
      comments: a.comments.map((c) => (c.id === commentId ? { ...c, text, editedAt: stamp() } : c)),
    }));

  const deleteComment = (id: string, commentId: string) => {
    updateAnnotation(id, (a) => {
      const comments = a.comments.filter((c) => c.id !== commentId);

      return comments.length ? { ...a, comments } : null;
    });
  };

  return { updateAnnotation, reply, editComment, deleteComment };
}

export function useAnnotations({ initial, parts, showToast, setSelectedIds, stopTools }: AnnotationOptions) {
  const [annotations, setAnnotations] = useState<SceneAnnotation[]>(initial);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AnnotationDraft | null>(null);
  const [commentMode, setCommentMode] = useState(false);
  const edits = useCommentEdits(setAnnotations);

  const toggleCommentMode = (on?: boolean) => {
    const next = on ?? !commentMode;

    setCommentMode(next);

    if (!next) {
      setDraft(null);

      return;
    }

    setSelectedIds([]);
    stopTools();
  };

  const place = (position: Vec3, partId: string | null) => {
    setActiveId(null);
    setDraft({ position, partId });
  };

  const create = (text: string) => {
    if (!draft) return;

    const thread = newThread(
      draft,
      parts.find((p) => p.id === draft.partId),
      text,
    );

    setAnnotations((prev) => [...prev, thread]);
    setDraft(null);
    setActiveId(thread.id);
  };

  const deleteThread = (id: string) => {
    const removed = annotations.find((a) => a.id === id);

    setAnnotations((prev) => prev.filter((a) => a.id !== id));
    setActiveId(null);

    if (!removed) return;

    showToast('Deleted comment', {
      tone: 'neutral',
      action: { label: 'Undo', onClick: () => setAnnotations((prev) => [...prev, removed]) },
    });
  };

  const toggleResolved = (id: string) => {
    const wasResolved = annotations.find((a) => a.id === id)?.resolved;

    edits.updateAnnotation(id, (a) => ({ ...a, resolved: !a.resolved }));

    if (wasResolved) return;

    setActiveId(null);
    showToast('Resolved', {
      tone: 'success',
      action: { label: 'Undo', onClick: () => edits.updateAnnotation(id, (a) => ({ ...a, resolved: false })) },
    });
  };

  const reset = (next: SceneAnnotation[]) => {
    setAnnotations(next);
    setActiveId(null);
    setDraft(null);
  };

  return {
    annotations,
    activeId,
    setActiveId,
    draft,
    setDraft,
    commentMode,
    setCommentMode,
    toggleCommentMode,
    place,
    create,
    reply: edits.reply,
    editComment: edits.editComment,
    deleteComment: edits.deleteComment,
    deleteThread,
    toggleResolved,
    reset,
  };
}

export type Annotations = ReturnType<typeof useAnnotations>;
