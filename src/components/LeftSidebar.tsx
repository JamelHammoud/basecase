import React, { useMemo, useState } from 'react';
import {
  ChevronRight,
  Group,
  Image as ImageIcon,
  ImageOff,
  Eye,
  EyeOff,
  Lock,
  Unlock,
} from 'lucide-react';
import { PartsPanel } from './PartsPanel';
import { LibraryPanel, LibraryPanelProps } from './LibraryPanel';
import { selectionBounds } from '../utils/selection';
import {
  CatalogItem,
  ScenePart,
} from '../types/robotics';
import {
  IconButton,
  LAYOUT,
  SectionHeader,
} from '../design-system';

export type LeftTab = 'layers' | 'parts' | 'library';

const VIEW_TITLES: Record<LeftTab, string> = { layers: 'Layers', parts: 'Parts', library: 'Library' };

interface LeftSidebarProps {
  open: boolean;
  width: number;
  /** Drag handle rendered on the panel edge */
  edge?: React.ReactNode;
  /** Disables the width animation while the user drags the edge */
  resizing?: boolean;
  tab: LeftTab;
  onTabChange: (tab: LeftTab) => void;
  // Layers
  parts: ScenePart[];
  selectedIds: string[];
  /** `additive` for Shift/⌘-click */
  onSelectPart: (id: string | null, additive?: boolean) => void;
  onSelectIds: (ids: string[], additive?: boolean) => void;
  onRenameGroup: (groupId: string, name: string) => void;
  showReferenceImages: boolean;
  onToggleReferenceImages: () => void;
  onTogglePartFlag: (id: string, flag: 'visible' | 'locked') => void;
  onRenamePart: (id: string, name: string) => void;
  onPartContextMenu: (id: string, x: number, y: number) => void;
  // Parts
  onAddCatalogItem: (item: CatalogItem) => void;
  /** The scene brief; part names in it are suggested in Parts */
  sceneGoal?: string;
  /** The Parts search field, so the scene can focus it (⌘F) */
  partsSearchRef?: React.MutableRefObject<HTMLInputElement | null>;
  // Library
  library: Omit<LibraryPanelProps, 'parts' | 'selectedIds'>;
}

export const LeftSidebar: React.FC<LeftSidebarProps> = (props) => {
  const { open, width, tab } = props;

  return (
    <aside
      aria-hidden={!open}
      // Width includes the gap after the card, so collapsing closes the gap too; the resizer sits in it
      className={`relative h-full shrink-0 overflow-hidden ${
        props.resizing ? '' : 'transition-[width] duration-[240ms] ease-[cubic-bezier(0.2,0,0,1)]'
      }`}
      style={{ width: open ? width + LAYOUT.panelGap : 0 }}
    >
      {open && props.edge}
      <div className="sidebar-surface h-full flex flex-col overflow-hidden rounded-[12px]" style={{ width }}>
        {/* Card header: the current view's name (the view rail switches views; scenes live in the tabs) */}
        {/* The title centers on y = 66, with the first rail icon */}
        <div className="h-[44px] shrink-0 flex items-center px-[12px]">
          <h2 className="text-[15px] font-semibold text-white/90 tracking-[-0.01em]">{VIEW_TITLES[tab]}</h2>
        </div>

        <div className="flex-1 min-h-0 flex flex-col pt-[4px]">
          {tab === 'layers' && <LayersTab {...props} />}
          {tab === 'parts' && (
            <PartsPanel
              onAdd={props.onAddCatalogItem}
              parts={props.parts}
              goal={props.sceneGoal ?? ''}
              searchInputRef={props.partsSearchRef}
            />
          )}
          {tab === 'library' && <LibraryPanel {...props.library} parts={props.parts} selectedIds={props.selectedIds} />}
        </div>
      </div>
    </aside>
  );
};

/* ------------------------------------------------------------------ */
/* Layers                                                              */
/* ------------------------------------------------------------------ */

type LayerRow =
  | { type: 'group'; id: string; name: string; members: ScenePart[] }
  | { type: 'part'; part: ScenePart; inGroup: boolean };

const LayersTab: React.FC<LeftSidebarProps> = ({
  parts,
  selectedIds,
  onSelectPart,
  onSelectIds,
  onTogglePartFlag,
  onRenamePart,
  onRenameGroup,
  onPartContextMenu,
  showReferenceImages,
  onToggleReferenceImages,
}) => {
  const imageCount = parts.filter((p) => p.kind === 'image_plane').length;
  const cutoutCount = parts.filter((p) => p.role === 'cutout').length;
  const sceneSize = useMemo(() => {
    const solid = parts.filter((p) => p.visible && p.role !== 'reference');
    if (solid.length === 0) return null;
    const { min, max } = selectionBounds(solid);
    return [0, 1, 2].map((i) => Math.round(max[i] - min[i])).join(' × ');
  }, [parts]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const rows = useMemo(() => {
    const out: LayerRow[] = [];
    const seen = new Set<string>();
    for (const p of parts) {
      if (p.group) {
        if (seen.has(p.group.id)) continue;
        seen.add(p.group.id);
        const members = parts.filter((m) => m.group?.id === p.group!.id);
        out.push({ type: 'group', id: p.group.id, name: p.group.name, members });
        if (!collapsed.has(p.group.id)) {
          members.forEach((m) => out.push({ type: 'part', part: m, inGroup: true }));
        }
      } else {
        out.push({ type: 'part', part: p, inGroup: false });
      }
    }
    return out;
  }, [parts, collapsed]);

  // An empty scene leaves Layers empty
  if (parts.length === 0) return null;

  const rename = (current: string, onCommit: (v: string) => void) => (
    <input
      autoFocus
      defaultValue={current}
      onFocus={(e) => e.target.select()}
      onClick={(e) => e.stopPropagation()}
      onBlur={(e) => {
        onCommit(e.target.value.trim() || current);
        setEditingId(null);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setEditingId(null);
      }}
      className="flex-1 min-w-0 h-6 px-1 -mx-1 rounded bg-black/30 ring-1 ring-[#0d99ff] outline-none text-white"
    />
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex-1 overflow-y-auto px-[8px] pb-3" onClick={() => onSelectPart(null)}>
        <SectionHeader
          title={`${parts.length} ${parts.length === 1 ? 'part' : 'parts'}${
            cutoutCount > 0 ? ` · ${cutoutCount} ${cutoutCount === 1 ? 'cutout' : 'cutouts'}` : ''
          }`}
          action={
            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              {selectedIds.length > 1 && (
                <span className="text-[12px] text-[#5cb8ff] tabular">{selectedIds.length} selected</span>
              )}
              {imageCount > 0 && (
                <IconButton
                  icon={showReferenceImages ? <ImageIcon className="w-3.5 h-3.5" /> : <ImageOff className="w-3.5 h-3.5" />}
                  title={showReferenceImages ? 'Hide reference images' : 'Show reference images'}
                  shortcut="⇧I"
                  size="xs"
                  isToggled={!showReferenceImages}
                  onClick={onToggleReferenceImages}
                />
              )}
            </div>
          }
        />
        <ul className="space-y-px">
          {rows.map((row) => {
            if (row.type === 'group') {
              const ids = row.members.map((m) => m.id);
              const allSelected = ids.every((id) => selectedIds.includes(id));
              const isCollapsed = collapsed.has(row.id);
              return (
                <li
                  key={`g-${row.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectIds(ids, e.shiftKey || e.metaKey);
                  }}
                  onDoubleClick={() => setEditingId(row.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (!allSelected) onSelectIds(ids);
                    onPartContextMenu(ids[0], e.clientX, e.clientY);
                  }}
                  className={`group h-8 pl-1 pr-2 rounded-lg flex items-center gap-1.5 text-[13px] font-medium cursor-default transition-colors ${
                    allSelected ? 'bg-[#0d99ff]/[0.18] text-white' : 'text-white/85 hover:bg-white/[0.05]'
                  }`}
                >
                  <button
                    type="button"
                    aria-label={isCollapsed ? 'Expand group' : 'Collapse group'}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCollapsed((prev) => {
                        const next = new Set(prev);
                        if (next.has(row.id)) next.delete(row.id);
                        else next.add(row.id);
                        return next;
                      });
                    }}
                    className="w-5 h-5 rounded flex items-center justify-center text-white/40 hover:text-white/80 cursor-default"
                  >
                    <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-150 ${isCollapsed ? '' : 'rotate-90'}`} />
                  </button>
                  <Group className="w-3.5 h-3.5 text-white/50 shrink-0" />
                  {editingId === row.id ? (
                    rename(row.name, (v) => onRenameGroup(row.id, v))
                  ) : (
                    <span className="flex-1 truncate">{row.name}</span>
                  )}
                  <span className="text-[12px] text-white/35 tabular">{row.members.length}</span>
                </li>
              );
            }

            const p = row.part;
            const selected = selectedIds.includes(p.id);
            return (
              <li
                key={p.id}
                onClick={(e) => {
                  e.stopPropagation();
                  // In the list, a plain click always targets the row itself
                  if (e.shiftKey || e.metaKey) onSelectPart(p.id, true);
                  else onSelectIds([p.id]);
                }}
                onDoubleClick={() => setEditingId(p.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (!selected) onSelectIds([p.id]);
                  onPartContextMenu(p.id, e.clientX, e.clientY);
                }}
                className={`group h-8 ${row.inGroup ? 'pl-8' : 'pl-2.5'} pr-1 rounded-lg flex items-center gap-2 text-[13px] cursor-default transition-colors ${
                  selected ? 'bg-[#0d99ff]/[0.18] text-white' : 'text-white/80 hover:bg-white/[0.05]'
                } ${!p.visible || (p.kind === 'image_plane' && !showReferenceImages) ? 'text-white/35' : ''}`}
              >
                <PartGlyph part={p} />
                {editingId === p.id ? (
                  rename(p.name, (v) => onRenamePart(p.id, v))
                ) : (
                  <span className="flex-1 truncate">{p.name}</span>
                )}
                <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                  <RowToggle
                    on={p.locked}
                    alwaysShow={p.locked}
                    onClick={() => onTogglePartFlag(p.id, 'locked')}
                    title={p.locked ? 'Unlock' : 'Lock'}
                    iconOn={<Lock className="w-3.5 h-3.5" />}
                    iconOff={<Unlock className="w-3.5 h-3.5" />}
                  />
                  <RowToggle
                    on={!p.visible}
                    alwaysShow={!p.visible}
                    onClick={() => onTogglePartFlag(p.id, 'visible')}
                    title={p.visible ? 'Hide' : 'Show'}
                    iconOn={<EyeOff className="w-3.5 h-3.5" />}
                    iconOff={<Eye className="w-3.5 h-3.5" />}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      {sceneSize && (
        <div className="h-9 shrink-0 px-[12px] flex items-center justify-between border-t border-white/[0.06] text-[12.5px] select-none">
          <span className="text-white/45">Overall size</span>
          <span className="text-white/70 tabular">
            {sceneSize} <span className="text-white/40">mm</span>
          </span>
        </div>
      )}
    </div>
  );
};

const PartGlyph: React.FC<{ part: ScenePart }> = ({ part }) => {
  if (part.kind === 'image_plane' && part.imageDataUrl) {
    return <img src={part.imageDataUrl} alt="" className="w-4 h-4 rounded-[4px] object-cover shrink-0 ring-1 ring-white/15" />;
  }
  if (part.role === 'cutout') {
    return (
      <span className="w-3 h-3 rounded-full shrink-0 border border-dashed border-red-400" aria-label="Cutout" />
    );
  }
  if (part.role === 'reference') {
    return <span className="w-3 h-3 shrink-0 flex items-center justify-center"><span className="w-px h-3 bg-cyan-400" /></span>;
  }
  return (
    <span
      className="w-3 h-3 rounded-[4px] shrink-0 ring-1 ring-inset ring-white/20"
      style={{ backgroundColor: part.color }}
    />
  );
};

const RowToggle: React.FC<{
  on: boolean;
  alwaysShow: boolean;
  onClick: () => void;
  title: string;
  iconOn: React.ReactNode;
  iconOff: React.ReactNode;
}> = ({ on, alwaysShow, onClick, title, iconOn, iconOff }) => (
  <button
    type="button"
    aria-label={title}
    onClick={onClick}
    className={`w-7 h-7 rounded-md flex items-center justify-center cursor-default transition-opacity hover:bg-white/[0.08] ${
      on ? 'text-white/60' : 'text-white/40 hover:text-white/80'
    } ${alwaysShow ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
  >
    {on ? iconOn : iconOff}
  </button>
);

/* ------------------------------------------------------------------ */
/* Library (scenes + models)                                           */
/* ------------------------------------------------------------------ */
