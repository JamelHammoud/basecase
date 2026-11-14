import React, { useRef, useState } from 'react';
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
import { ConsolePanel } from './ConsolePanel';
import { AddPanelMenu } from './edit/AddPanelMenu';
import type { ConsoleEditor } from './edit/consoleEditor';
import { usePanelDrag } from './edit/usePanelDrag';
import type { PanelContext } from './panelContext';
import { AREA_MAX, AREA_MIN } from '../../cases/console/format';

interface CaseRunAreaProps {
  area: PlacedArea;
  side: 'before' | 'after';
  ctx: PanelContext;
  header: React.ReactNode;
  editor?: ConsoleEditor;
}

interface MenuAt {
  x: number;
  y: number;
  panel: PanelSpec | null;
}

function menuItems(
  menu: MenuAt,
  editor: ConsoleEditor,
  area: number,
  rename: (id: string) => void,
): ContextMenuEntry[] {
  const full = !editor.canAdd(area);
  const add: ContextMenuEntry = {
    label: 'Add Panel',
    icon: <PlusIcon />,
    ...(full
      ? { disabled: true, onSelect: () => undefined }
      : { submenu: (close: () => void) => <AddPanelMenu editor={editor} area={area} close={close} /> }),
  };
  const { panel } = menu;

  if (!panel) return [add];

  return [renameEntry(() => rename(panel.id)), deleteEntry(() => editor.remove(panel)), { divider: true }, add];
}

export const CaseRunArea: React.FC<CaseRunAreaProps> = ({ area, side, ctx, header, editor }) => {
  const { ref, style } = useScrollFade();
  const [menu, setMenu] = useState<MenuAt | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState<number | null>(null);
  const drafted = useRef<number | null>(null);
  const drag = usePanelDrag({
    accepts: (id, drop) => !!editor?.canMove(id, drop),
    onDrop: (id, drop) => editor?.move(id, drop),
  });
  const size = draft ?? area.size;
  const surface = side === 'before' ? 'sidebar-surface' : 'bg-[#1f1f1f]';

  const openMenu = (e: React.MouseEvent) => {
    if (!editor || e.defaultPrevented) return;

    e.preventDefault();

    const id = (e.target as Element).closest<HTMLElement>('[data-panel]')?.dataset.panel;

    setMenu({ x: e.clientX, y: e.clientY, panel: area.panels.find((p) => p.id === id) ?? null });
  };

  const renamed = (id: string) => (title: string | null) => {
    setRenaming(null);

    if (title) editor?.rename(id, title);
  };

  return (
    <aside
      data-testid="case-run-area"
      className="relative h-full shrink-0 overflow-hidden"
      style={{ width: size + LAYOUT.panelGap }}
    >
      <div
        data-area-card={area.at}
        className={`h-full flex flex-col overflow-hidden rounded-[12px] ${surface}`}
        style={{ width: size, marginLeft: side === 'after' ? LAYOUT.panelGap : 0 }}
        onContextMenu={openMenu}
      >
        {area.last && header}
        <div
          ref={ref}
          style={style}
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden"
          {...(editor ? drag.handlers : {})}
        >
          {area.panels.map((panel) => (
            <ConsolePanel
              key={panel.id}
              panel={panel}
              ctx={ctx}
              editable={!!editor}
              dragging={drag.dragging === panel.id}
              surface={surface}
              onRenamed={renaming === panel.id ? renamed(panel.id) : null}
            />
          ))}
        </div>
      </div>
      {editor && (
        <PanelResizer
          edge={side === 'before' ? 'right' : 'left'}
          width={size}
          min={AREA_MIN}
          max={AREA_MAX}
          onResize={(width) => {
            drafted.current = width;
            setDraft(width);
          }}
          onResizingChange={(resizing) => {
            if (resizing || drafted.current === null) return;

            editor.resize(area.at, drafted.current);
            drafted.current = null;
            setDraft(null);
          }}
        />
      )}
      {drag.indicator}
      {menu && editor && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems(menu, editor, area.at, setRenaming)}
          onClose={() => setMenu(null)}
        />
      )}
    </aside>
  );
};
