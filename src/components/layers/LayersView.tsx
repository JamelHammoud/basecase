import React, { useState } from 'react';
import { IconButton, SectionHeader, PhotoIcon, PhotoOffIcon } from '../../design-system';
import type { ScenePart } from '../../types/robotics';
import { GroupRow, PartRow } from './LayerItems';
import { layerRows, layersTitle, overallSize } from './layerRows';

export interface LayersViewProps {
  parts: ScenePart[];
  selectedIds: string[];
  showReferenceImages: boolean;
  onSelectPart: (id: string | null, additive?: boolean) => void;
  onSelectIds: (ids: string[], additive?: boolean) => void;
  onRenameGroup: (groupId: string, name: string) => void;
  onToggleReferenceImages: () => void;
  onTogglePartFlag: (id: string, flag: 'visible' | 'locked') => void;
  onRenamePart: (id: string, name: string) => void;
  onPartContextMenu: (id: string, x: number, y: number) => void;
}

const HeaderActions: React.FC<{ props: LayersViewProps }> = ({ props }) => {
  const hasImages = props.parts.some((p) => p.kind === 'image_plane');
  const shown = props.showReferenceImages;

  return (
    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      {props.selectedIds.length > 1 && (
        <span className="text-[12px] text-[#5cb8ff] tabular">{props.selectedIds.length} selected</span>
      )}
      {hasImages && (
        <IconButton
          icon={shown ? <PhotoIcon className="w-3.5 h-3.5" /> : <PhotoOffIcon className="w-3.5 h-3.5" />}
          title={shown ? 'Hide reference images' : 'Show reference images'}
          shortcut="⇧I"
          size="xs"
          isToggled={!shown}
          onClick={props.onToggleReferenceImages}
        />
      )}
    </div>
  );
};

const SizeFooter: React.FC<{ size: string }> = ({ size }) => (
  <div className="h-9 shrink-0 px-[12px] flex items-center justify-between border-t border-white/[0.06] text-[12.5px] select-none">
    <span className="text-white/45">Overall size</span>
    <span className="text-white/70 tabular">
      {size} <span className="text-white/40">mm</span>
    </span>
  </div>
);

export const LayersView: React.FC<LayersViewProps> = (props) => {
  const { parts, selectedIds } = props;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  if (parts.length === 0) {
    return null;
  }

  const selected = new Set(selectedIds);
  const size = overallSize(parts);
  const toggleCollapsed = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);

      if (!next.delete(id)) next.add(id);

      return next;
    });
  const clickPart = (part: ScenePart, additive: boolean) => {
    if (additive) props.onSelectPart(part.id, true);
    else props.onSelectIds([part.id]);
  };
  const partMenu = (part: ScenePart, x: number, y: number) => {
    if (!selected.has(part.id)) props.onSelectIds([part.id]);

    props.onPartContextMenu(part.id, x, y);
  };
  const groupMenu = (ids: string[], allSelected: boolean, at: { x: number; y: number }) => {
    if (!allSelected) props.onSelectIds(ids);

    props.onPartContextMenu(ids[0], at.x, at.y);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex-1 overflow-y-auto px-[8px] pb-3" onClick={() => props.onSelectPart(null)}>
        <SectionHeader title={layersTitle(parts)} action={<HeaderActions props={props} />} />
        <ul className="space-y-px">
          {layerRows(parts, collapsed).map((row) =>
            row.type === 'group' ? (
              <GroupRow
                key={`g-${row.id}`}
                id={row.id}
                name={row.name}
                memberIds={row.members.map((m) => m.id)}
                selected={row.members.every((m) => selected.has(m.id))}
                collapsed={collapsed.has(row.id)}
                editing={editingId === row.id}
                onSelect={props.onSelectIds}
                onToggleCollapsed={toggleCollapsed}
                onEdit={setEditingId}
                onRename={props.onRenameGroup}
                onContextMenu={groupMenu}
              />
            ) : (
              <PartRow
                key={row.part.id}
                part={row.part}
                inGroup={row.inGroup}
                selected={selected.has(row.part.id)}
                dimmed={!row.part.visible || (row.part.kind === 'image_plane' && !props.showReferenceImages)}
                editing={editingId === row.part.id}
                onClick={clickPart}
                onEdit={setEditingId}
                onRename={props.onRenamePart}
                onContextMenu={partMenu}
                onToggle={props.onTogglePartFlag}
              />
            ),
          )}
        </ul>
      </div>
      {size && <SizeFooter size={size} />}
    </div>
  );
};
