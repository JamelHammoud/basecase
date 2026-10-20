import React from 'react';
import { ConfirmDialog } from '../../design-system';
import type { SceneAnnotation } from '../../types/robotics';

export type PendingDelete = { kind: 'thread' } | { kind: 'comment'; commentId: string } | null;

const Quote: React.FC<{ text: string }> = ({ text }) => (
  <p className="line-clamp-3 whitespace-pre-wrap break-words text-white/80">{text}</p>
);

function dialogCopy(annotation: SceneAnnotation, number: number, pending: NonNullable<PendingDelete>) {
  if (pending.kind === 'comment') {
    const text = annotation.comments.find((c) => c.id === pending.commentId)?.text ?? '';

    return {
      title: 'Delete comment?',
      body: (
        <>
          <Quote text={text} />
          <p className="mt-[8px]">You can’t undo this.</p>
        </>
      ),
    };
  }

  const count = annotation.comments.length;

  return {
    title: `Delete thread #${number}?`,
    body: count > 1 ? <p>Deletes its {count} comments.</p> : <Quote text={annotation.comments[0]?.text ?? ''} />,
  };
}

export const DeleteCommentDialog: React.FC<{
  annotation: SceneAnnotation;
  number: number;
  pending: PendingDelete;
  onCancel: () => void;
  onDeleteThread: (id: string) => void;
  onDeleteComment: (id: string, commentId: string) => void;
}> = ({ annotation, number, pending, onCancel, onDeleteThread, onDeleteComment }) => {
  if (!pending) return null;

  const { title, body } = dialogCopy(annotation, number, pending);

  const confirm = () => {
    onCancel();

    if (pending.kind === 'thread') onDeleteThread(annotation.id);
    else onDeleteComment(annotation.id, pending.commentId);
  };

  return (
    <ConfirmDialog isOpen title={title} onCancel={onCancel} onConfirm={confirm}>
      {body}
    </ConfirmDialog>
  );
};
