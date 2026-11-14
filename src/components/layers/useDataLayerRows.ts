import { useState, useSyncExternalStore } from 'react';
import type { ContextMenuEntry } from '../../design-system';
import type { DataLayerRow, DataLayerStore } from '../../dataLayers/store';
import { dataLayerMenu } from './dataLayerMenu';

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
      items: dataLayerMenu(layer, store),
    });

  return {
    layers,
    menu,
    openMenu,
    closeMenu: () => setMenu(null),
    toggle: (id: string, visible: boolean) => store?.setVisible(id, visible),
  };
}
