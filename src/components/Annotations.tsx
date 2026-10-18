import React, { useEffect } from 'react';
import { SceneAnnotation, ScenePart } from '../types/robotics';
import type { Viewport3DHandle } from './Viewport3D';
import { CURSORS } from '../design-system';
import { CommentComposer } from './annotations/CommentComposer';
import { Thread } from './annotations/Thread';
import { CARD_WIDTH, DRAFT_KEY, usePinLayout } from './annotations/usePinLayout';

export interface AnnotationDraft {
  position: [number, number, number];
  partId: string | null;
}

interface AnnotationLayerProps {
  annotations: SceneAnnotation[];
  parts: ScenePart[];
  viewportRef: React.RefObject<Viewport3DHandle | null>;
  activeId: string | null;
  draft: AnnotationDraft | null;
  onOpen: (id: string | null) => void;
  onCancelDraft: () => void;
  onCreate: (text: string) => void;
  onReply: (id: string, text: string) => void;
  onEditComment: (id: string, commentId: string, text: string) => void;
  onDeleteComment: (id: string, commentId: string) => void;
  onToggleResolved: (id: string) => void;
  onDeleteThread: (id: string) => void;
}

function pinColors(isActive: boolean, resolved: boolean | undefined) {
  if (isActive) return 'bg-[#0d99ff] text-white';

  return resolved ? 'bg-neutral-500 text-white' : 'bg-white text-black';
}

const Pin: React.FC<{
  annotation: SceneAnnotation;
  number: number;
  isActive: boolean;
  track: (el: HTMLElement | null) => void;
  onClick: () => void;
}> = ({ annotation: a, number, isActive, track, onClick }) => {
  const first = a.comments[0]?.text ?? '';
  const replies = a.comments.length - 1;

  return (
    <div ref={track} className="absolute left-0 top-0 will-change-transform" style={{ visibility: 'hidden' }}>
      <button
        type="button"
        aria-label={`Comment ${number}`}
        onClick={onClick}
        style={{ cursor: CURSORS.arrow }}
        className={`group pointer-events-auto absolute bottom-0 left-0 flex items-center h-8 min-w-8 rounded-[16px_16px_16px_4px] shadow-[0_4px_14px_rgba(0,0,0,0.45),0_0_0_1.5px_rgba(255,255,255,0.9)] transition-[background-color,transform] duration-150 hover:scale-[1.04] origin-bottom-left animate-pop-up ${pinColors(isActive, a.resolved)}`}
      >
        <span className="w-8 shrink-0 text-center text-[13px] font-semibold tabular">{number}</span>
        {!isActive && first && (
          <span className="max-w-0 group-hover:max-w-[220px] overflow-hidden transition-[max-width] duration-200 ease-[cubic-bezier(0.2,0,0,1)]">
            <span className="flex items-center gap-2 pr-3 whitespace-nowrap text-[13px]">
              <span className="truncate max-w-[170px]">{first}</span>
              {replies > 0 && <span className="opacity-50 tabular">{replies}</span>}
            </span>
          </span>
        )}
      </button>
    </div>
  );
};

export const AnnotationLayer: React.FC<AnnotationLayerProps> = (props) => {
  const { annotations, parts, viewportRef, activeId, draft, onOpen, onCancelDraft } = props;
  const shown = annotations.filter((a) => !a.resolved || a.id === activeId);
  const active = annotations.find((a) => a.id === activeId) || null;
  const { layerRef, cardRef, trackPin, ownsTarget } = usePinLayout({ viewportRef, shown, parts, draft, activeId });

  useEffect(() => {
    if (!active && !draft) return;

    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;

      if (ownsTarget(t) || (t as HTMLElement).closest?.('[data-annotation-list]')) return;

      if (draft) onCancelDraft();
      else onOpen(null);
    };

    window.addEventListener('pointerdown', onDown, true);

    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [active, draft, onOpen, onCancelDraft, ownsTarget]);

  const numberOf = (id: string) => annotations.findIndex((a) => a.id === id) + 1;

  return (
    <div ref={layerRef} className="absolute inset-0 z-[15] pointer-events-none overflow-hidden">
      {shown.map((a) => {
        const isActive = a.id === activeId && !draft;

        return (
          <Pin
            key={a.id}
            annotation={a}
            number={numberOf(a.id)}
            isActive={isActive}
            track={(el) => trackPin(a.id, el)}
            onClick={() => onOpen(isActive ? null : a.id)}
          />
        );
      })}

      {draft && (
        <div ref={(el) => trackPin(DRAFT_KEY, el)} className="absolute left-0 top-0" style={{ visibility: 'hidden' }}>
          <span className="absolute bottom-0 left-0 w-8 h-8 rounded-[16px_16px_16px_4px] bg-[#0d99ff] shadow-[0_4px_14px_rgba(0,0,0,0.45),0_0_0_1.5px_rgba(255,255,255,0.9)] animate-pop-up" />
        </div>
      )}

      {(draft || active) && (
        <div
          ref={cardRef}
          key={draft ? DRAFT_KEY : active!.id}
          className="absolute left-0 top-0 pointer-events-auto"
          style={{ width: CARD_WIDTH, visibility: 'hidden', WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <div className="glass-menu rounded-2xl overflow-hidden animate-pop-in">
            {draft ? (
              <CommentComposer
                autoFocus
                placeholder="Add a comment"
                onSubmit={props.onCreate}
                onEscape={onCancelDraft}
              />
            ) : (
              <Thread
                annotation={active!}
                number={numberOf(active!.id)}
                partName={parts.find((p) => p.id === active!.partId)?.name}
                {...props}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};
