import React, { useEffect, useRef, useState } from 'react';
import { SceneAnnotation } from '../../types/robotics';
import { timeAgo } from '../../utils/timeAgo';
import { Button, IconButton, CircleCheckIcon, CloseIcon, DeleteIcon, EditIcon } from '../../design-system';
import { AutoTextarea, CommentComposer } from './CommentComposer';
import { DeleteCommentDialog, type PendingDelete } from './DeleteCommentDialog';

export interface ThreadActions {
  onOpen: (id: string | null) => void;
  onReply: (id: string, text: string) => void;
  onEditComment: (id: string, commentId: string, text: string) => void;
  onDeleteComment: (id: string, commentId: string) => void;
  onToggleResolved: (id: string) => void;
  onDeleteThread: (id: string) => void;
}

const CommentItem: React.FC<{
  text: string;
  createdAt: string;
  edited: boolean;
  onSave: (text: string) => void;
  onDelete: () => void;
}> = ({ text, createdAt, edited, onSave, onDelete }) => {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(text);

  const save = () => {
    const v = value.trim();

    if (v && v !== text) onSave(v);

    setEditing(false);
  };

  return (
    <div className="group relative px-4 py-2.5">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-6 h-6 rounded-full bg-gradient-to-br from-[#3aa8ff] to-[#0b6fd6] text-white text-[11px] font-semibold flex items-center justify-center shrink-0">
          Y
        </span>
        <span className="text-[13px] font-semibold text-white/90">You</span>
        <span className="text-[12px] text-white/40">
          {timeAgo(createdAt)}
          {edited && ' · edited'}
        </span>
      </div>

      {editing ? (
        <div className="pl-8 space-y-2">
          <AutoTextarea
            autoFocus
            value={value}
            onChange={setValue}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
                e.preventDefault();
                save();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                setValue(text);
                setEditing(false);
              }
            }}
            className="w-full rounded-lg bg-black/25 ring-1 ring-inset ring-[#0d99ff] px-2.5 py-2 text-[13.5px] leading-relaxed text-white outline-none resize-none"
          />
          <div className="flex justify-end gap-1.5">
            <Button
              size="xs"
              variant="ghost"
              onClick={() => {
                setValue(text);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
            <Button size="xs" variant="primary" onClick={save} disabled={!value.trim()}>
              Save
            </Button>
          </div>
        </div>
      ) : (
        <p className="pl-8 text-[13.5px] leading-relaxed text-white/85 whitespace-pre-wrap break-words select-text">
          {text}
        </p>
      )}

      {!editing && (
        <div className="absolute top-2 right-2 flex opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <IconButton
            icon={<EditIcon className="w-3.5 h-3.5" />}
            title="Edit"
            size="xs"
            tooltipSide="top"
            onClick={() => {
              setValue(text);
              setEditing(true);
            }}
          />
          <IconButton
            icon={<DeleteIcon className="w-3.5 h-3.5" />}
            title="Delete"
            size="xs"
            variant="danger"
            tooltipSide="top"
            onClick={onDelete}
          />
        </div>
      )}
    </div>
  );
};

export const Thread: React.FC<ThreadActions & { annotation: SceneAnnotation; number: number; partName?: string }> = ({
  annotation: a,
  number,
  partName,
  onOpen,
  onReply,
  onEditComment,
  onDeleteComment,
  onToggleResolved,
  onDeleteThread,
}) => {
  const [pending, setPending] = useState<PendingDelete>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [a.comments.length]);

  return (
    <>
      <div className="h-11 pl-4 pr-1.5 flex items-center gap-2 border-b border-white/[0.08]">
        <span className="text-[13px] font-semibold text-white/90 tabular">#{number}</span>
        {partName && <span className="text-[13px] text-white/45 truncate">on {partName}</span>}
        <div className="flex-1" />
        <IconButton
          icon={<CircleCheckIcon className="w-4 h-4" />}
          title={a.resolved ? 'Reopen' : 'Resolve'}
          isToggled={a.resolved}
          tooltipSide="top"
          onClick={() => onToggleResolved(a.id)}
        />
        <IconButton
          icon={<DeleteIcon className="w-4 h-4" />}
          title="Delete thread"
          variant="danger"
          tooltipSide="top"
          onClick={() => setPending({ kind: 'thread' })}
        />
        <IconButton
          icon={<CloseIcon className="w-4 h-4" />}
          title="Close"
          shortcut="Esc"
          tooltipSide="top"
          onClick={() => onOpen(null)}
        />
      </div>

      <div ref={listRef} className="max-h-[300px] overflow-y-auto py-1">
        {a.comments.map((c) => (
          <CommentItem
            key={c.id}
            text={c.text}
            createdAt={c.createdAt}
            edited={!!c.editedAt}
            onSave={(text) => onEditComment(a.id, c.id, text)}
            onDelete={() => setPending({ kind: 'comment', commentId: c.id })}
          />
        ))}
      </div>

      <div className="border-t border-white/[0.08]">
        <CommentComposer
          autoFocus
          placeholder="Reply"
          onSubmit={(t) => onReply(a.id, t)}
          onEscape={() => onOpen(null)}
        />
      </div>

      <DeleteCommentDialog
        annotation={a}
        number={number}
        pending={pending}
        onCancel={() => setPending(null)}
        onDeleteThread={onDeleteThread}
        onDeleteComment={onDeleteComment}
      />
    </>
  );
};
