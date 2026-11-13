import React, { useState } from 'react';
import { EmptyState, IconButton, PhotoIcon, PhotoOffIcon, SearchField, SectionHeader } from '../../design-system';
import type { ScenePart } from '../../types/robotics';
import { GroupRow, PartRow } from './LayerItems';
import { layerRows, layersTitle, overallSize } from './layerRows';
import { useRevealSelection } from './useRevealSelection';

export interface LayersViewProps {
  parts: ScenePart[];
  selectedIds: string[];
  open?: boolean;
  showReferenceImages: boolean;
  onSelectPart: (id: string | null, additive?: boolean) => void;
  onSelectIds: (ids: string[], additive?: boolean) => void;
  onRenameGroup: (groupId: string, name: string) => void;
  onToggleReferenceImages: () => void;
  onTogglePartFlag: (id: string, flag: 'visible' | 'locked') => void;
  onRenamePart: (id: string, name: string) => void;
  onPartContextMenu: (id: string, x: number, y: number) => void;
}

const ReferenceImagesToggle: React.FC<{ props: LayersViewProps }> = ({ props }) => {
  const shown = props.showReferenceImages;

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <IconButton
        icon={shown ? <PhotoIcon className="w-3.5 h-3.5" /> : <PhotoOffIcon className="w-3.5 h-3.5" />}
        title={shown ? 'Hide reference images' : 'Show reference images'}
        shortcut="⇧I"
        size="xs"
        isToggled={!shown}
        onClick={props.onToggleReferenceImages}
      />
    </div>
  );
};

const SizeFooter: React.FC<{ size: string }> = ({ size }) => (
  <div className="h-9 shrink-0 px-[12px] flex items-center justify-between border-t border-white/[0.06] text-[12.5px] select-none">
    <span className="text-white/50">Overall size</span>
    <span className="text-white/70 tabular">
      {size} <span className="text-white/50">mm</span>
    </span>
  </div>
);

export const LayersView: React.FC<LayersViewProps> = (props) => {
  const { parts, selectedIds } = props;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState('');
  const scrollerRef = useRevealSelection(parts, selectedIds[0], props.open ?? true);

  if (parts.length === 0) {
    return null;
  }

  const selected = new Set(selectedIds);
  const searching = query.trim() !== '';
  const rows = layerRows(parts, collapsed, query);
  const size = overallSize(parts);
  const hasImages = parts.some((p) => p.kind === 'image_plane');
  const toggleCollapsed = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);

      if (!next.delete(id)) next.add(id);

      return next;
    });
  const clickPart = (part: ScenePart, additive: boolean) => {
    if (additive) props.onSelectIds([part.id], true);
    else props.onSelectIds([part.id]);
  };
  const partMenu = (part: ScenePart, x: number, y: number) => {
    if (!selected.has(part.id)) props.onSelectIds([part.id]);

    props.onPartContextMenu(part.id, x, y);
  };
  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Escape') return;

    if (query) setQuery('');
    else e.currentTarget.blur();
  };
  const groupMenu = (ids: string[], allSelected: boolean, at: { x: number; y: number }) => {
    if (!allSelected) props.onSelectIds(ids);

    props.onPartContextMenu(ids[0], at.x, at.y);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-[12px] pb-[10px] shrink-0">
        <SearchField
          value={query}
          onChange={setQuery}
          onKeyDown={onSearchKey}
          placeholder="Search layers"
          aria-label="Search layers"
        />
      </div>
      <div ref={scrollerRef} className="flex-1 overflow-y-auto px-[8px] pb-3" onClick={() => props.onSelectPart(null)}>
        <SectionHeader title={layersTitle(parts)} action={hasImages && <ReferenceImagesToggle props={props} />} />
        <ul className="space-y-px">
          {rows.map((row) =>
            row.type === 'group' ? (
              <GroupRow
                key={`g-${row.id}`}
                id={row.id}
                name={row.name}
                memberIds={row.members.map((m) => m.id)}
                selected={row.members.every((m) => selected.has(m.id))}
                collapsed={!searching && collapsed.has(row.id)}
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
        {searching && rows.length === 0 && <EmptyState title={`No matches for “${query.trim()}”`} />}
      </div>
      {size && <SizeFooter size={size} />}
    </div>
  );
};
