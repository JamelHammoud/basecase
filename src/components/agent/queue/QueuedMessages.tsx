import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  confirmAction,
  IconButton,
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  DeleteIcon,
  GripIcon,
} from '../../../design-system';
import { plural } from '../../../../electron/plural.mjs';
import { QueueControls, QueuedItem } from '../types';
import { lineTop, QUEUE_ROW_PX } from './queueDrag';
import { QueuedRowBody } from './QueuedRowBody';
import { QueueDrag, SETTLE_MS, useQueueDrag } from './useQueueDrag';

const EASE = 'cubic-bezier(0.2, 0, 0, 1)';
const ROW = 'group/queued relative flex items-center gap-2 px-2.5 rounded-[10px] cursor-default select-none';
const BANNER = '#222222';
const ROW_HOVER = '#2a2a2a';
const ACTIONS_FADE = `linear-gradient(to right, transparent, ${ROW_HOVER} 32px)`;

const RowActions: React.FC<{ item: QueuedItem; queue: QueueControls }> = ({ item, queue }) => (
  <div
    className="absolute inset-y-0 right-0 flex items-center pl-10 pr-1 rounded-r-[10px] opacity-0 pointer-events-none group-hover/queued:opacity-100 group-hover/queued:pointer-events-auto group-focus-within/queued:opacity-100 group-focus-within/queued:pointer-events-auto transition-opacity duration-150"
    style={{ backgroundImage: ACTIONS_FADE }}
  >
    <IconButton
      icon={<ArrowUpIcon className="w-4 h-4" />}
      title="Send now"
      tooltipSide="top"
      size="xs"
      onClick={() => void queue.sendNow(item.id)}
    />
    <IconButton
      icon={<DeleteIcon className="w-4 h-4" />}
      title="Delete"
      tooltipSide="top"
      size="xs"
      onClick={() =>
        confirmAction({
          title: 'Delete queued message?',
          body: item.params.text ? (
            <p className="line-clamp-3 whitespace-pre-wrap break-words text-white/80">{item.params.text}</p>
          ) : undefined,
          confirmLabel: 'Delete',
          onConfirm: () => queue.remove(item.id),
        })
      }
    />
    <GripIcon className="w-3.5 h-3.5 mx-1.5 text-white/35 cursor-grab" />
  </div>
);

const DragOverlay: React.FC<{ drag: QueueDrag; item: QueuedItem }> = ({ drag, item }) =>
  createPortal(
    <div
      className="fixed z-[60] pointer-events-none"
      style={{
        top: drag.top,
        left: drag.left,
        width: drag.width,
        transition: drag.settling ? `top ${SETTLE_MS}ms ${EASE}` : undefined,
      }}
    >
      <div
        className={`${ROW} bg-[#2e2e2e] shadow-[0_10px_28px_rgba(0,0,0,0.5),0_0_0_0.5px_rgba(0,0,0,0.6)] transition-transform duration-150`}
        style={{ height: QUEUE_ROW_PX, transform: drag.settling ? undefined : 'scale(1.02)' }}
      >
        <QueuedRowBody params={item.params} />
      </div>
    </div>,
    document.body,
  );

const DropLine: React.FC<{ drag: QueueDrag }> = ({ drag }) =>
  drag.settling || drag.to === drag.from ? null : (
    <div
      className="absolute left-1 right-1 h-[2px] -translate-y-1/2 rounded-full bg-[#0d99ff] pointer-events-none"
      style={{ top: lineTop(drag.to, drag.from) }}
    >
      <span
        className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full border-2 border-[#0d99ff]"
        style={{ background: BANNER }}
      />
    </div>
  );

export const QueuedMessages: React.FC<{ queue: QueueControls; onEdit: (id: string) => void }> = ({ queue, onEdit }) => {
  const listRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(true);
  const { items } = queue;
  const { drag, start, move, end, cancel } = useQueueDrag({
    count: items.length,
    listRef,
    onMove: queue.move,
    onClick: onEdit,
  });
  const dragged = drag && items.find((q) => q.id === drag.id);

  if (!items.length) return null;

  const onRowKey = (e: React.KeyboardEvent, index: number, id: string) => {
    const step = { ArrowUp: -1, ArrowDown: 1 }[e.key];

    if (e.key === 'Enter') onEdit(id);

    if (!step || !e.altKey) return;

    e.preventDefault();

    const to = index + step;

    if (to >= 0 && to < items.length) queue.move(index, to);
  };

  return (
    <div
      className="relative -mb-5 pb-5 rounded-t-[20px] ring-1 ring-inset ring-white/[0.06] animate-fade-in"
      style={{ background: BANNER }}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="w-full h-10 pl-4 pr-3 flex items-center gap-2 text-[13px] text-white/55 hover:text-white/85 cursor-default transition-colors"
      >
        <span className="flex-1 min-w-0 truncate text-left">{plural(items.length, 'message')} queued</span>
        {open ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
      </button>
      {open && (
        <div className="max-h-[194px] overflow-y-auto overflow-x-hidden px-1.5 pt-0.5 pb-1.5">
          <div ref={listRef} className="relative flex flex-col gap-[2px]">
            {items.map((item, index) => (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                aria-label={`Edit queued message ${index + 1}`}
                onPointerDown={(e) => start(e, item.id, index)}
                onPointerMove={move}
                onPointerUp={end}
                onPointerCancel={cancel}
                onKeyDown={(e) => onRowKey(e, index, item.id)}
                className={`${ROW} hover:bg-[#2a2a2a] focus-visible:bg-[#2a2a2a] transition-[opacity,background-color] duration-150 ${drag?.id === item.id ? 'opacity-30 cursor-grabbing' : ''}`}
                style={{ height: QUEUE_ROW_PX }}
              >
                <QueuedRowBody params={item.params} />
                {!drag && <RowActions item={item} queue={queue} />}
              </div>
            ))}
            {drag && <DropLine drag={drag} />}
          </div>
        </div>
      )}
      {drag && dragged && <DragOverlay drag={drag} item={dragged} />}
    </div>
  );
};
