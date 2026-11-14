import type React from 'react';
import { useState } from 'react';
import type { PlacedArea } from '../../cases/console/layout';
import type { PanelSpec } from '../../cases/console/panelKinds';
import { ContextMenu, deleteEntry, PlusIcon, renameEntry, type ContextMenuEntry } from '../../design-system';
import { ADD_PANEL, type ConsoleEditor } from './consoleEditor';

interface Menu {
  x: number;
  y: number;
  panel: PanelSpec | null;
}

export function useAreaMenu(area: PlacedArea, editor: ConsoleEditor | null) {
  const [menu, setMenu] = useState<Menu | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  const open = (e: React.MouseEvent<HTMLElement>) => {
    if (!editor || e.defaultPrevented) return;

    e.preventDefault();

    const id = (e.target as Element).closest<HTMLElement>('[data-panel]')?.dataset.panel;

    setMenu({ x: e.clientX, y: e.clientY, panel: area.panels.find((p) => p.id === id) ?? null });
  };

  const items = (panel: PanelSpec | null): ContextMenuEntry[] => [
    { label: ADD_PANEL, icon: <PlusIcon />, onSelect: () => editor?.addPanel(area.at) },
    ...(panel
      ? [{ divider: true } as const, renameEntry(() => setRenaming(panel.id)), deleteEntry(() => editor?.remove(panel))]
      : []),
  ];

  return {
    open,
    renaming,
    stopRenaming: () => setRenaming(null),
    element: menu && <ContextMenu x={menu.x} y={menu.y} items={items(menu.panel)} onClose={() => setMenu(null)} />,
  };
}
