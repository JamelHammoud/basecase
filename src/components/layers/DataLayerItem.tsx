import React from 'react';
import { HiddenIcon, LookIcon, RowActions, Tooltip, WarningIcon } from '../../design-system';
import type { DataLayerRow } from '../../dataLayers/store';
import { ACTIONS_PLACE, ROW, ROW_FILL, RowToggle, rowIndent, rowTone } from './LayerItems';

export interface DataLayerItemProps {
  layer: DataLayerRow;
  depth: number;
  onToggle: (id: string, visible: boolean) => void;
  onMenu: (layer: DataLayerRow, at: { x: number; y: number }) => void;
}

const Glyph: React.FC = () => (
  <span className="w-3 h-3 shrink-0 grid grid-cols-2 gap-[2px] p-[1px]" aria-hidden>
    {[0, 1, 2, 3].map((i) => (
      <span key={i} className="rounded-full bg-[#0d99ff]" />
    ))}
  </span>
);

export const DataLayerItem: React.FC<DataLayerItemProps> = ({ layer, depth, onToggle, onMenu }) => {
  const hidden = !layer.visible;

  return (
    <li
      data-layer-row={`data:${layer.id}`}
      data-visible={layer.visible}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();

        if (layer.fields.length) onMenu(layer, { x: e.clientX, y: e.clientY });
      }}
      style={{ paddingLeft: rowIndent(depth, false) }}
      className={`${ROW} pr-2.5 gap-2 ${rowTone(false, 'text-white/80')} ${hidden ? 'text-white/50' : ''}`}
    >
      <Glyph />
      <span className="flex-1 truncate">{layer.name}</span>
      {layer.missing && (
        <Tooltip label={layer.missing}>
          <span className="h-[18px] flex items-center shrink-0" data-testid="data-layer-missing">
            <WarningIcon className="w-4 h-4 text-amber-400" />
          </span>
        </Tooltip>
      )}
      <RowActions fill={ROW_FILL} shown={hidden} className={ACTIONS_PLACE}>
        <RowToggle
          on={hidden}
          pinned={hidden}
          onClick={() => onToggle(layer.id, hidden)}
          title={hidden ? 'Show' : 'Hide'}
          icons={[<HiddenIcon key="on" className="w-3.5 h-3.5" />, <LookIcon key="off" className="w-3.5 h-3.5" />]}
        />
      </RowActions>
    </li>
  );
};
