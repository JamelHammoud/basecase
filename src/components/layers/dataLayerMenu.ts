import type { ContextMenuEntry } from '../../design-system';
import type { DataLayerRow, DataLayerStore } from '../../dataLayers/store';

export function dataLayerMenu(layer: DataLayerRow, store: DataLayerStore | undefined): ContextMenuEntry[] {
  if (layer.matching !== undefined)
    return [
      {
        label: 'Scan Matching',
        checked: layer.matching,
        onSelect: () => store?.setMatching(!layer.matching),
      },
    ];

  return layer.fields.map((field) => ({
    label: field,
    checked: layer.colorBy === field,
    onSelect: () => store?.setColorBy(layer.id, layer.colorBy === field ? null : field),
  }));
}
