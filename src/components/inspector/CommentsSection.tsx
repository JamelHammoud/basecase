import React from 'react';
import { MessageCircle, Plus } from 'lucide-react';
import type { SceneAnnotation } from '../../types/robotics';
import { timeAgo } from '../../utils/timeAgo';
import { IconButton, Section } from '../../design-system';
import type { InspectorProps } from './types';

const CommentRow: React.FC<{ annotation: SceneAnnotation; n: number; active: boolean; onOpen: () => void }> = ({
  annotation: a,
  n,
  active,
  onOpen,
}) => {
  const first = a.comments[0];

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={`w-full text-left px-2 py-2 rounded-lg flex items-start gap-2.5 cursor-default transition-colors ${
          active ? 'bg-[#0d99ff]/[0.16]' : 'hover:bg-white/[0.05]'
        } ${a.resolved ? 'opacity-50' : ''}`}
      >
        <span
          className={`mt-0.5 w-6 h-6 shrink-0 rounded-[12px_12px_12px_3px] text-[11.5px] font-semibold tabular flex items-center justify-center ${
            active ? 'bg-[#0d99ff] text-white' : 'bg-white text-black'
          }`}
        >
          {n}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] text-white/85 truncate">{first?.text}</span>
          <span className="flex items-center gap-1.5 text-[12px] text-white/40">
            {a.resolved ? 'Resolved' : timeAgo(first?.createdAt ?? a.createdAt)}
            {a.comments.length > 1 && (
              <>
                <span>·</span>
                <MessageCircle className="w-3 h-3" />
                <span className="tabular">{a.comments.length - 1}</span>
              </>
            )}
          </span>
        </span>
      </button>
    </li>
  );
};

export const CommentsSection: React.FC<InspectorProps & { list: SceneAnnotation[] }> = ({
  list,
  annotations,
  activeAnnotationId,
  onOpenAnnotation,
  onAddComment,
}) => (
  <Section
    title="Comments"
    className={list.length === 0 ? 'pb-1' : ''}
    actions={
      <IconButton
        icon={<Plus className="w-3.5 h-3.5" />}
        title="Add comment"
        shortcut="M"
        size="xs"
        onClick={onAddComment}
      />
    }
  >
    {list.length > 0 && (
      <ul className="-mx-2 space-y-px" data-annotation-list>
        {list.map((a) => (
          <CommentRow
            key={a.id}
            annotation={a}
            n={annotations.findIndex((x) => x.id === a.id) + 1}
            active={a.id === activeAnnotationId}
            onOpen={() => onOpenAnnotation(a.id)}
          />
        ))}
      </ul>
    )}
  </Section>
);
