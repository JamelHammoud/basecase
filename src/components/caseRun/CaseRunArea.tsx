import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { SIDE_SIZE } from '../../cases/console/codeEdits';
import { AREA_MAX, AREA_MIN } from '../../cases/console/format';
import type { PlacedArea } from '../../cases/console/layout';
import type { PanelSpec } from '../../cases/console/panelKinds';
import {
  ContextMenu,
  deleteEntry,
  LAYOUT,
  PanelResizer,
  PlusIcon,
  renameEntry,
  useScrollFade,
  type ContextMenuEntry,
} from '../../design-system';
import type { ConsoleEditing } from '../../workspace/useConsoleEditing';
import { ConsolePanel, type PanelArranging } from './ConsolePanel';
import type { PanelContext } from './panelContext';
import type { DropMark } from './panelDrop';
import { useAreaResize } from './useAreaResize';
import { usePanelDrag } from './usePanelDrag';

interface CaseRunAreaProps {
  area: PlacedArea;
  side: 'before' | 'after';
  ctx: PanelContext;
  header: React.ReactNode;
  editing?: ConsoleEditing | null;
}

interface Menu {
  x: number;
  y: number;
  panel: string | null;
}

const Mark: React.FC<{ mark: DropMark }> = ({ mark }) =>
  createPortal(
    <div
      data-testid="panel-drop-mark"
      className="fixed z-[90] rounded-full bg-[#0d99ff] pointer-events-none"
      style={{ left: mark.left, top: mark.top, width: mark.width, height: mark.height }}
    />,
    document.body,
  );

function menuItems(editing: ConsoleEditing, at: number, panel: string | null): ContextMenuEntry[] {
  const add: ContextMenuEntry = { label: 'Add Panel', icon: <PlusIcon />, onSelect: () => editing.startAdd(at) };

  if (!panel) return [add];

  return [add, renameEntry(() => editing.startRename(panel)), deleteEntry(() => editing.remove(panel))];
}

export const CaseRunArea: React.FC<CaseRunAreaProps> = ({ area, side, ctx, header, editing = null }) => {
  const { ref, style } = useScrollFade();
  const [menu, setMenu] = useState<Menu | null>(null);
  const drag = usePanelDrag(editing?.canvasAt ?? -1, (id, place) => editing?.move(id, place));
  const resizing = useAreaResize(area, editing?.resize);
  const surface = side === 'before' ? 'sidebar-surface' : 'bg-[#1f1f1f]';

  const arranging = (panel: PanelSpec): PanelArranging | null =>
    editing && {
      dragging: drag.dragging === panel.id,
      renaming: editing.renaming === panel.id,
      surface,
      onGrab: (e) => drag.start(e, panel.id),
      onRenamed: (title) => editing.finishRename(panel.id, title),
    };

  const openMenu = (e: React.MouseEvent<HTMLElement>) => {
    if (e.defaultPrevented) return;

    e.preventDefault();

    const panel = (e.target as HTMLElement).closest<HTMLElement>('[data-panel]')?.dataset.panel ?? null;

    setMenu({ x: e.clientX, y: e.clientY, panel });
  };

  return (
    <aside
      data-testid="case-run-area"
      data-area={area.at}
      className="relative h-full shrink-0 overflow-hidden"
      style={{ width: resizing.size + LAYOUT.panelGap }}
      onContextMenu={editing ? openMenu : undefined}
    >
      <div
        className={`h-full flex flex-col overflow-hidden rounded-[12px] ${surface}`}
        style={{ width: resizing.size, marginLeft: side === 'after' ? LAYOUT.panelGap : 0 }}
      >
        {area.last && header}
        <div ref={ref} style={style} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          {area.panels.map((panel) => (
            <ConsolePanel key={panel.id} panel={panel} ctx={ctx} arranging={arranging(panel)} />
          ))}
        </div>
      </div>
      {editing && (
        <PanelResizer
          edge={side === 'before' ? 'right' : 'left'}
          width={resizing.size}
          min={AREA_MIN}
          max={AREA_MAX}
          defaultWidth={SIDE_SIZE}
          onResize={resizing.onResize}
          onResizingChange={resizing.onResizingChange}
        />
      )}
      {drag.mark && <Mark mark={drag.mark} />}
      {editing && menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems(editing, area.at, menu.panel)}
          onClose={() => setMenu(null)}
        />
      )}
    </aside>
  );
};
