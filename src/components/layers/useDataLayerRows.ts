import { useState, useSyncExternalStore } from 'react';
import type { ContextMenuEntry } from '../../design-system';
import type { DataLayerRow, DataLayerStore } from '../../dataLayers/store';

const NO_ROWS: DataLayerRow[] = [];
const noRows = () => NO_ROWS;
const unsubscribed = () => () => {};

export interface DataLayerMenu {
  x: number;
  y: number;
  items: ContextMenuEntry[];
}

export function useDataLayerRows(store: DataLayerStore | undefined) {
  const layers = useSyncExternalStore(store?.subscribe ?? unsubscribed, store?.rows ?? noRows);
  const [menu, setMenu] = useState<DataLayerMenu | null>(null);
  const openMenu = (layer: DataLayerRow, at: { x: number; y: number }) =>
    setMenu({
      ...at,
      items: layer.fields.map((field) => ({
        label: field,
        checked: layer.colorBy === field,
        onSelect: () => store?.setColorBy(layer.id, layer.colorBy === field ? null : field),
      })),
    });

  return {
    layers,
    menu,
    openMenu,
    closeMenu: () => setMenu(null),
    toggle: (id: string, visible: boolean) => store?.setVisible(id, visible),
  };
}
