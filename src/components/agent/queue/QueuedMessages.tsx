import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import { confirmAction, IconButton, ArrowUpIcon, DeleteIcon, EditIcon } from '../../../design-system';
import { QueueControls, QueuedItem } from '../types';
import { lineTop, QUEUE_ROW_PX } from './queueDrag';
import { QueuedRowBody } from './QueuedRowBody';
import { QueueDrag, SETTLE_MS, useQueueDrag } from './useQueueDrag';

const EASE = 'cubic-bezier(0.2, 0, 0, 1)';
const ROW = 'group/queued flex items-center gap-2 pl-2 pr-1 rounded-[10px] cursor-default select-none';

const RowActions: React.FC<{ item: QueuedItem; queue: QueueControls; onEdit: (id: string) => void }> = ({
  item,
  queue,
  onEdit,
}) => (
  <div className="flex items-center opacity-0 group-hover/queued:opacity-100 group-focus-within/queued:opacity-100 transition-opacity">
    <IconButton
      icon={<ArrowUpIcon className="w-4 h-4" />}
      title="Send now"
      tooltipSide="top"
      size="xs"
      onClick={() => void queue.sendNow(item.id)}
    />
    <IconButton
      icon={<EditIcon className="w-4 h-4" />}
      title="Edit"
      tooltipSide="top"
      size="xs"
      onClick={() => onEdit(item.id)}
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
        className={`${ROW} bg-[#2c2c2c] shadow-[0_10px_28px_rgba(0,0,0,0.5),0_0_0_0.5px_rgba(0,0,0,0.6)] transition-transform duration-150`}
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
      <span className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full border-2 border-[#0d99ff] bg-[#1f1f1f]" />
    </div>
  );

export const QueuedMessages: React.FC<{ queue: QueueControls; onEdit: (id: string) => void }> = ({ queue, onEdit }) => {
  const listRef = useRef<HTMLDivElement | null>(null);
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
    <div className="px-3 pt-1 shrink-0 animate-fade-in">
      <div className="px-2 pb-1 text-[12px] font-medium text-white/40">Queued</div>
      <div className="max-h-[194px] overflow-y-auto overflow-x-hidden py-1">
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
              className={`${ROW} hover:bg-white/[0.05] focus-visible:bg-white/[0.05] transition-[opacity,background-color] duration-150 ${drag?.id === item.id ? 'opacity-30 cursor-grabbing' : ''}`}
              style={{ height: QUEUE_ROW_PX }}
            >
              <QueuedRowBody params={item.params}>
                <RowActions item={item} queue={queue} onEdit={onEdit} />
              </QueuedRowBody>
            </div>
          ))}
          {drag && <DropLine drag={drag} />}
        </div>
      </div>
      {drag && dragged && <DragOverlay drag={drag} item={dragged} />}
    </div>
  );
};
