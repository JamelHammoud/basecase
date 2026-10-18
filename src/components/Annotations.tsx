import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUp, CircleCheck, Pencil, Trash2, X } from 'lucide-react';
import { SceneAnnotation, ScenePart } from '../types/robotics';
import { annotationWorldPosition } from '../utils/aiHandoff';
import { timeAgo } from '../utils/timeAgo';
import type { Viewport3DHandle } from './Viewport3D';
import { Button, IconButton } from '../design-system';

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

const CARD_WIDTH = 320;
const DRAFT_KEY = '__draft__';

/**
 * Figma-style comment pins that track 3D points as the camera moves.
 * Positions update every frame via direct style writes (no React re-render).
 */
export const AnnotationLayer: React.FC<AnnotationLayerProps> = (props) => {
  const { annotations, parts, viewportRef, activeId, draft, onOpen, onCancelDraft } = props;
  const layerRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const pinRefs = useRef(new Map<string, HTMLElement>());

  // Pins shown on canvas: open threads, plus the active one even if resolved
  const shown = annotations.filter((a) => !a.resolved || a.id === activeId);
  const active = annotations.find((a) => a.id === activeId) || null;

  const stateRef = useRef({ shown, parts, draft, activeId });
  useEffect(() => {
    stateRef.current = { shown, parts, draft, activeId };
  });

  // Per-frame projection
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const vp = viewportRef.current;
      const layer = layerRef.current;
      if (!vp || !layer) return;
      const { shown: list, parts: ps, draft: d, activeId: aid } = stateRef.current;

      const keys: string[] = list.map((a) => a.id);
      const pts = list.map((a) => annotationWorldPosition(a, ps));
      if (d) {
        keys.push(DRAFT_KEY);
        pts.push(d.position);
      }
      const proj = vp.projectPoints(pts);
      const W = layer.clientWidth;
      const H = layer.clientHeight;
      let anchor: { x: number; y: number; visible: boolean } | null = null;

      keys.forEach((k, i) => {
        const el = pinRefs.current.get(k);
        const p = proj[i];
        if (el) {
          el.style.transform = `translate3d(${Math.round(p.x)}px, ${Math.round(p.y)}px, 0)`;
          el.style.visibility = p.visible ? 'visible' : 'hidden';
        }
        if ((d && k === DRAFT_KEY) || (!d && k === aid)) anchor = p;
      });

      const card = cardRef.current;
      if (card && anchor) {
        const a = anchor as { x: number; y: number; visible: boolean };
        const ch = card.offsetHeight;
        let left = a.x + 42;
        if (left + CARD_WIDTH > W - 12) left = a.x - 12 - CARD_WIDTH;
        left = Math.max(12, left);
        let top = a.y - 40;
        top = Math.max(60, Math.min(H - ch - 96, top));
        card.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
        card.style.visibility = 'visible';
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [viewportRef]);

  // Dismiss on outside click
  useEffect(() => {
    if (!active && !draft) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (cardRef.current?.contains(t)) return;
      for (const el of pinRefs.current.values()) if (el.contains(t)) return;
      if ((t as HTMLElement).closest?.('[data-annotation-list]')) return;
      if (draft) onCancelDraft();
      else onOpen(null);
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [active, draft, onOpen, onCancelDraft]);

  const setPinRef = (key: string) => (el: HTMLElement | null) => {
    if (el) pinRefs.current.set(key, el);
    else pinRefs.current.delete(key);
  };

  const numberOf = (id: string) => annotations.findIndex((a) => a.id === id) + 1;

  return (
    <div ref={layerRef} className="absolute inset-0 z-[15] pointer-events-none overflow-hidden">
      {shown.map((a) => {
        const isActive = a.id === activeId && !draft;
        const first = a.comments[0]?.text ?? '';
        const replies = a.comments.length - 1;
        return (
          <div
            key={a.id}
            ref={setPinRef(a.id)}
            className="absolute left-0 top-0 will-change-transform"
            style={{ visibility: 'hidden' }}
          >
            <button
              type="button"
              aria-label={`Comment ${numberOf(a.id)}`}
              onClick={() => onOpen(isActive ? null : a.id)}
              className={`group pointer-events-auto absolute bottom-0 left-0 flex items-center h-8 min-w-8 rounded-[16px_16px_16px_4px] shadow-[0_4px_14px_rgba(0,0,0,0.45),0_0_0_1.5px_rgba(255,255,255,0.9)] cursor-default transition-[background-color,transform] duration-150 hover:scale-[1.04] origin-bottom-left animate-pop-up ${
                isActive ? 'bg-[#0d99ff] text-white' : a.resolved ? 'bg-neutral-500 text-white' : 'bg-white text-black'
              }`}
            >
              <span className="w-8 shrink-0 text-center text-[13px] font-semibold tabular">{numberOf(a.id)}</span>
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
      })}

      {draft && (
        <div ref={setPinRef(DRAFT_KEY)} className="absolute left-0 top-0" style={{ visibility: 'hidden' }}>
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
              <Composer
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

/* ------------------------------------------------------------------ */

const Thread: React.FC<
  AnnotationLayerProps & { annotation: SceneAnnotation; number: number; partName?: string }
> = ({ annotation: a, number, partName, onOpen, onReply, onEditComment, onDeleteComment, onToggleResolved, onDeleteThread }) => {
  const [confirmDelete, setConfirmDelete] = useState(false);
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
          icon={<CircleCheck className="w-4 h-4" />}
          title={a.resolved ? 'Reopen' : 'Resolve'}
          isToggled={a.resolved}
          tooltipSide="top"
          onClick={() => onToggleResolved(a.id)}
        />
        <IconButton
          icon={<Trash2 className="w-4 h-4" />}
          title={confirmDelete ? 'Click again to delete thread' : 'Delete thread'}
          variant="danger"
          tooltipSide="top"
          className={confirmDelete ? '!bg-red-500 !text-white' : ''}
          onClick={() => (confirmDelete ? onDeleteThread(a.id) : setConfirmDelete(true))}
          onMouseLeave={() => setConfirmDelete(false)}
        />
        <IconButton icon={<X className="w-4 h-4" />} title="Close" shortcut="Esc" tooltipSide="top" onClick={() => onOpen(null)} />
      </div>

      <div ref={listRef} className="max-h-[300px] overflow-y-auto py-1">
        {a.comments.map((c) => (
          <CommentItem
            key={c.id}
            text={c.text}
            createdAt={c.createdAt}
            edited={!!c.editedAt}
            onSave={(text) => onEditComment(a.id, c.id, text)}
            onDelete={() => onDeleteComment(a.id, c.id)}
          />
        ))}
      </div>

      <div className="border-t border-white/[0.08]">
        <Composer autoFocus placeholder="Reply" onSubmit={(t) => onReply(a.id, t)} onEscape={() => onOpen(null)} />
      </div>
    </>
  );
};

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
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                save();
              } else if (e.key === 'Enter' && !e.shiftKey) {
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
            <Button size="xs" variant="ghost" onClick={() => { setValue(text); setEditing(false); }}>
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
          <IconButton icon={<Pencil className="w-3.5 h-3.5" />} title="Edit" size="xs" tooltipSide="top" onClick={() => { setValue(text); setEditing(true); }} />
          <IconButton icon={<Trash2 className="w-3.5 h-3.5" />} title="Delete" size="xs" variant="danger" tooltipSide="top" onClick={onDelete} />
        </div>
      )}
    </div>
  );
};

const Composer: React.FC<{
  placeholder: string;
  autoFocus?: boolean;
  onSubmit: (text: string) => void;
  onEscape: () => void;
}> = ({ placeholder, autoFocus, onSubmit, onEscape }) => {
  const [value, setValue] = useState('');
  const send = () => {
    const v = value.trim();
    if (!v) return;
    onSubmit(v);
    setValue('');
  };
  return (
    <div className="flex items-end gap-2 p-2 pl-3">
      <AutoTextarea
        autoFocus={autoFocus}
        value={value}
        onChange={setValue}
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            send();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onEscape();
          }
        }}
        className="flex-1 bg-transparent py-1.5 text-[13.5px] leading-relaxed text-white outline-none resize-none"
      />
      <button
        type="button"
        aria-label="Post"
        disabled={!value.trim()}
        onClick={send}
        className="w-7 h-7 mb-0.5 rounded-full bg-[#0d99ff] text-white flex items-center justify-center shrink-0 cursor-default transition-[transform,background-color] active:scale-[0.92] disabled:bg-white/10 disabled:text-white/35"
      >
        <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
      </button>
    </div>
  );
};

const AutoTextarea: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}> = ({ value, onChange, placeholder, autoFocus, className, onKeyDown }) => {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
    el.style.overflowY = el.scrollHeight > 140 ? 'auto' : 'hidden';
  }, [value]);
  useEffect(() => {
    if (!autoFocus) return;
    // Wait a frame so the card has been positioned before focusing
    const id = requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      el.setSelectionRange(el.value.length, el.value.length);
    });
    return () => cancelAnimationFrame(id);
  }, [autoFocus]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      spellCheck
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      className={className}
    />
  );
};
