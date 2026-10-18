import React, { useMemo, useRef, useState } from 'react';
import {
  Box,
  Copy,
  FileUp,
  ImagePlus,
  Layers,
  MoreHorizontal,
  Pencil,
  Plus,
  SquareArrowOutUpRight,
  Trash2,
} from 'lucide-react';
import { CustomModelDefinition, SavedSceneRecord, ScenePart } from '../types/robotics';
import { MODEL_DRAG_TYPE } from '../data/dnd';
import { usePartsThumbnail } from '../three/partThumbnails';
import { modelToParts } from '../utils/libraryParts';
import { selectionBounds } from '../utils/selection';
import { timeAgo } from '../utils/timeAgo';
import { Header, SizeLine, Stat } from './PartDetails';
import {
  Button,
  ContextMenu,
  ContextMenuEntry,
  EmptyState,
  HoverCard,
  IconButton,
  MenuDivider,
  MenuItem,
  PopoverMenu,
  SearchField,
  SectionHeader,
  Tooltip,
  useScrollFade,
} from '../design-system';

export interface LibraryPanelProps {
  /** The scene in this tab */
  currentSceneId: string;
  /** Every open tab and the saved scene it edits */
  openTabs: Array<{ id: string; sceneId: string }>;
  savedScenes: SavedSceneRecord[];
  customModels: CustomModelDefinition[];
  /** This scene's parts and selection (for the Save menu) */
  parts: ScenePart[];
  selectedIds: string[];
  onOpenScene: (scene: SavedSceneRecord) => void;
  onSaveScene: () => void;
  onRenameScene: (scene: SavedSceneRecord, name: string) => void;
  onDuplicateScene: (scene: SavedSceneRecord) => void;
  onDeleteScene: (scene: SavedSceneRecord) => void;
  onInsertModel: (model: CustomModelDefinition) => void;
  onRenameModel: (model: CustomModelDefinition, name: string) => void;
  onDuplicateModel: (model: CustomModelDefinition) => void;
  onDeleteModel: (model: CustomModelDefinition) => void;
  onSaveModel: (mode: 'selected' | 'all') => void;
  onImportSvg: () => void;
  onImageToModel: () => void;
}

type Menu = { x: number; y: number; entries: ContextMenuEntry[] };

/**
 * Library: saved scenes and models as thumbnail grids, searchable, in the same voice as Parts.
 * Click opens a scene (or inserts a model); hover shows details beside the panel; right-click
 * or ⋯ has Rename, Duplicate and Delete (with Undo).
 */
export const LibraryPanel: React.FC<LibraryPanelProps> = (props) => {
  const { savedScenes, customModels, currentSceneId, openTabs, parts, selectedIds } = props;
  const [query, setQuery] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const { ref: fadeRef, style: fadeStyle } = useScrollFade();

  const q = query.trim().toLowerCase();
  const matches = (...fields: Array<string | undefined>) => !q || fields.some((f) => f?.toLowerCase().includes(q));
  const scenes = savedScenes.filter((s) => matches(s.name, s.globalGoal));
  const models = customModels.filter((m) => matches(m.name, m.description));
  const openIds = new Set(openTabs.map((t) => t.sceneId));

  const sceneMenu = (s: SavedSceneRecord): ContextMenuEntry[] => [
    ...(s.id === currentSceneId
      ? []
      : [
          {
            label: openIds.has(s.id) ? 'Show Tab' : 'Open',
            icon: <SquareArrowOutUpRight className="w-3.5 h-3.5" />,
            onSelect: () => props.onOpenScene(s),
          },
        ]),
    { label: 'Rename', icon: <Pencil className="w-3.5 h-3.5" />, onSelect: () => setRenaming(s.id) },
    { label: 'Duplicate', icon: <Copy className="w-3.5 h-3.5" />, onSelect: () => props.onDuplicateScene(s) },
    { divider: true },
    { label: 'Delete', icon: <Trash2 className="w-3.5 h-3.5" />, tone: 'danger', onSelect: () => props.onDeleteScene(s) },
  ];
  const modelMenu = (m: CustomModelDefinition): ContextMenuEntry[] => [
    { label: 'Insert', icon: <Plus className="w-3.5 h-3.5" />, onSelect: () => props.onInsertModel(m) },
    { label: 'Rename', icon: <Pencil className="w-3.5 h-3.5" />, onSelect: () => setRenaming(m.id) },
    { label: 'Duplicate', icon: <Copy className="w-3.5 h-3.5" />, onSelect: () => props.onDuplicateModel(m) },
    { divider: true },
    { label: 'Delete', icon: <Trash2 className="w-3.5 h-3.5" />, tone: 'danger', onSelect: () => props.onDeleteModel(m) },
  ];
  const showMenu = (entries: ContextMenuEntry[]) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, entries });
  };

  const nothingFound = q && scenes.length === 0 && models.length === 0;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-[12px] pb-[10px] shrink-0">
        <SearchField
          value={query}
          onChange={setQuery}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              if (query) setQuery('');
              else (e.target as HTMLInputElement).blur();
            }
          }}
          placeholder="Search library"
          aria-label="Search library"
        />
      </div>

      <div ref={fadeRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden" style={fadeStyle}>
        {nothingFound ? (
          <EmptyState title={`No matches for “${query.trim()}”`} />
        ) : (
          <div className="px-[8px] pb-4">
            {(!q || scenes.length > 0) && (
              <section className="mb-3">
                <SectionHeader
                  title="Scenes"
                  action={<IconButton icon={<Plus className="w-3.5 h-3.5" />} title="Save this scene" shortcut="⌘S" size="xs" onClick={props.onSaveScene} />}
                />
                {scenes.length === 0 ? (
                  <InlineEmpty title="No saved scenes" action={<Button size="sm" onClick={props.onSaveScene}>Save This Scene</Button>} />
                ) : (
                  <div className="grid grid-cols-2 gap-x-[8px] gap-y-[12px] px-[4px]">
                    {scenes.map((s) => (
                      <SceneTile
                        key={s.id}
                        scene={s}
                        isCurrent={s.id === currentSceneId}
                        isOpen={openIds.has(s.id)}
                        renaming={renaming === s.id}
                        onOpen={() => props.onOpenScene(s)}
                        onRename={(name) => {
                          setRenaming(null);
                          if (name && name !== s.name) props.onRenameScene(s, name);
                        }}
                        onStartRename={() => setRenaming(s.id)}
                        onMenu={showMenu(sceneMenu(s))}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

            {(!q || models.length > 0) && (
              <section className="mb-3">
                <SectionHeader
                  title="Models"
                  action={
                    <NewModelMenu
                      canSaveSelection={selectedIds.length > 0}
                      canSaveScene={parts.length > 0}
                      onSaveModel={props.onSaveModel}
                      onImportSvg={props.onImportSvg}
                      onImageToModel={props.onImageToModel}
                    />
                  }
                />
                {models.length === 0 ? (
                  <InlineEmpty
                    title="No models"
                    action={
                      selectedIds.length > 0 ? (
                        <Button size="sm" onClick={() => props.onSaveModel('selected')}>Save Selection</Button>
                      ) : (
                        <Button size="sm" onClick={props.onImportSvg}>Import SVG…</Button>
                      )
                    }
                  />
                ) : (
                  <div className="grid grid-cols-2 gap-x-[8px] gap-y-[12px] px-[4px]">
                    {models.map((m) => (
                      <ModelTile
                        key={m.id}
                        model={m}
                        renaming={renaming === m.id}
                        onInsert={() => props.onInsertModel(m)}
                        onRename={(name) => {
                          setRenaming(null);
                          if (name && name !== m.name) props.onRenameModel(m, name);
                        }}
                        onStartRename={() => setRenaming(m.id)}
                        onMenu={showMenu(modelMenu(m))}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </div>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.entries} onClose={() => setMenu(null)} />}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Tiles                                                               */
/* ------------------------------------------------------------------ */

/** “Saved 2h ago”, “Saved just now”, “Saved Mar 3” */
function savedWhen(iso: string | undefined): string {
  if (!iso) return '';
  const t = timeAgo(iso);
  if (t === 'now') return 'Saved just now';
  return /^\d+[mhd]$/.test(t) ? `Saved ${t} ago` : `Saved ${t}`;
}

const sceneKey = (s: SavedSceneRecord) => `scene:${s.id}:${s.updatedAt}`;
const modelKey = (m: CustomModelDefinition) => `model:${m.id}:${m.createdAt}`;

/** A model's parts at the origin, for its thumbnail and details */
function modelParts(m: CustomModelDefinition): ScenePart[] {
  let n = 0;
  return modelToParts(m, [0, 0, 0], () => `preview-${n++}`).parts;
}

const SceneTile: React.FC<{
  scene: SavedSceneRecord;
  isCurrent: boolean;
  isOpen: boolean;
  renaming: boolean;
  onOpen: () => void;
  onStartRename: () => void;
  onRename: (name: string) => void;
  onMenu: (e: React.MouseEvent) => void;
}> = ({ scene, isCurrent, isOpen, renaming, onOpen, onStartRename, onRename, onMenu }) => {
  const thumb = usePartsThumbnail(sceneKey(scene), () => scene.parts ?? []);
  const count = scene.partCount || scene.parts?.length || 0;
  return (
    <Tile
      name={scene.name}
      meta={`${count} ${count === 1 ? 'part' : 'parts'} · ${timeAgo(scene.updatedAt)}`}
      thumb={thumb}
      fallback={scene.parts?.length ? undefined : 'Empty scene'}
      badge={isOpen ? 'Open' : undefined}
      current={isCurrent}
      openLabel={isOpen && !isCurrent ? 'Show tab' : 'Open'}
      renaming={renaming}
      onOpen={onOpen}
      onStartRename={onStartRename}
      onRename={onRename}
      onMenu={onMenu}
      details={() => <SceneDetails scene={scene} thumb={thumb} isOpen={isOpen} isCurrent={isCurrent} onOpen={onOpen} />}
    />
  );
};

const ModelTile: React.FC<{
  model: CustomModelDefinition;
  renaming: boolean;
  onInsert: () => void;
  onStartRename: () => void;
  onRename: (name: string) => void;
  onMenu: (e: React.MouseEvent) => void;
}> = ({ model, renaming, onInsert, onStartRename, onRename, onMenu }) => {
  const thumb = usePartsThumbnail(modelKey(model), () => modelParts(model));
  const d = model.defaultDimensions;
  return (
    <Tile
      name={model.name}
      meta={
        <>
          {fmt(d.width)} × {fmt(d.height)} × {fmt(d.depth)}
          <span className="text-white/30"> mm</span>
        </>
      }
      thumb={thumb || model.sourceImageDataUrl}
      openLabel="Insert"
      renaming={renaming}
      onOpen={onInsert}
      onAdd={onInsert}
      dragModelId={model.id}
      onStartRename={onStartRename}
      onRename={onRename}
      onMenu={onMenu}
      details={() => <ModelDetails model={model} thumb={thumb || model.sourceImageDataUrl} onInsert={onInsert} />}
    />
  );
};

const fmt = (v: number) => String(Math.round(v * 10) / 10);

/**
 * A library tile, built like a Parts tile: 4:3 studio thumbnail that zooms on hover, name and
 * one meta line. Hover shows details beside the panel and a ⋯ menu (also on right-click).
 * Double-click the name to rename it in place.
 */
const Tile: React.FC<{
  name: string;
  meta: React.ReactNode;
  thumb: string | undefined;
  /** Shown instead of a thumbnail when there's nothing to draw */
  fallback?: string;
  /** Small label on the thumbnail, e.g. Open */
  badge?: string;
  /** This tab's scene */
  current?: boolean;
  openLabel: string;
  renaming: boolean;
  onOpen: () => void;
  /** Shows a + on hover (models) */
  onAdd?: () => void;
  dragModelId?: string;
  onStartRename: () => void;
  onRename: (name: string) => void;
  onMenu: (e: React.MouseEvent) => void;
  details: () => React.ReactNode;
}> = ({ name, meta, thumb, fallback, badge, current, openLabel, renaming, onOpen, onAdd, dragModelId, onStartRename, onRename, onMenu, details }) => {
  const body = (
    <div
      data-library-tile
      className="group relative w-full"
      onContextMenu={onMenu}
      draggable={!!dragModelId && !renaming}
      onDragStart={(e) => {
        if (!dragModelId) return;
        e.dataTransfer.setData(MODEL_DRAG_TYPE, dragModelId);
        e.dataTransfer.effectAllowed = 'copy';
        const img = (e.currentTarget as HTMLElement).querySelector('img');
        if (img) e.dataTransfer.setDragImage(img, img.width / 2, img.height / 2);
      }}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${openLabel}: ${name}`}
        className={`preview block w-full aspect-[4/3] cursor-default active:scale-[0.98] transition-[background-color,transform] duration-150 ${
          current ? 'ring-[1.5px] ring-inset ring-[#0d99ff]/70' : ''
        }`}
      >
        {thumb ? (
          <img
            src={thumb}
            alt=""
            draggable={false}
            className="w-full h-full object-contain p-1.5 animate-fade-in transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] group-hover:scale-[1.06]"
          />
        ) : thumb === '' || fallback ? (
          <span className="w-full h-full flex items-center justify-center text-[12px] text-white/30">{fallback ?? 'No preview'}</span>
        ) : (
          <span className="block w-full h-full bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.04),transparent)] bg-[length:200%_100%] animate-shimmer" />
        )}
        {badge && (
          <span className="absolute top-[8px] left-[8px] h-5 px-1.5 rounded-full bg-black/50 ring-1 ring-white/10 backdrop-blur-md text-[12px] leading-5 font-medium text-white/80">
            {badge}
          </span>
        )}
      </button>

      {/* Name and meta; clicking them opens too (the thumbnail is the keyboard target) */}
      <div className="relative pl-0.5 pt-2 cursor-default" onClick={renaming ? undefined : onOpen}>
        {renaming ? (
          <RenameField name={name} onDone={onRename} />
        ) : (
          <div
            className="pr-7 text-[13px] leading-[19px] font-medium text-white/90 truncate"
            onDoubleClick={(e) => {
              e.stopPropagation();
              onStartRename();
            }}
          >
            {name}
          </div>
        )}
        <div className="text-[12px] text-white/40 tabular truncate">{meta}</div>
        {!renaming && (
          <div
            className="absolute right-0 top-[2px] opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <IconButton icon={<MoreHorizontal className="w-4 h-4" />} title="More" size="xs" className="!w-6 !h-6 !rounded-md" onClick={onMenu} />
          </div>
        )}
      </div>

      {onAdd && !renaming && (
        <Tooltip label="Insert" className="absolute top-[8px] right-[8px] opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <button
            type="button"
            aria-label={`Insert ${name}`}
            onClick={(e) => {
              e.stopPropagation();
              onAdd();
            }}
            className="w-7 h-7 rounded-full bg-[#0d99ff] text-white flex items-center justify-center cursor-default shadow-[0_2px_6px_rgba(0,0,0,0.4)] hover:bg-[#2ba5ff] active:scale-[0.94] transition-[background-color,transform] duration-150"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
          </button>
        </Tooltip>
      )}


    </div>
  );
  // No hover card while renaming, so it doesn't cover the field
  return renaming ? (
    body
  ) : (
    <HoverCard content={details} beside="aside" className="w-full">
      {body}
    </HoverCard>
  );
};

/** Inline rename on the tile's name line: Enter or blur saves, Esc cancels */
const RenameField: React.FC<{ name: string; onDone: (name: string) => void }> = ({ name, onDone }) => {
  const [draft, setDraft] = useState(name);
  const done = useRef(false);
  const finish = (value: string) => {
    if (done.current) return;
    done.current = true;
    onDone(value.trim());
  };
  return (
    <input
      autoFocus
      value={draft}
      spellCheck={false}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => finish(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(draft);
        if (e.key === 'Escape') finish(name);
      }}
      aria-label="Name"
      className="block w-[calc(100%+20px)] -ml-1 -my-[1px] h-[21px] px-1 rounded-[5px] bg-black/30 ring-1 ring-[#0d99ff] outline-none text-[13px] font-medium text-white/95"
    />
  );
};

const InlineEmpty: React.FC<{ title: string; action: React.ReactNode }> = ({ title, action }) => (
  <div className="mx-1 mb-1 rounded-xl bg-white/[0.025] ring-1 ring-inset ring-white/[0.04] px-3 py-5 flex flex-col items-center gap-3 text-center">
    <div className="text-[13px] text-white/50">{title}</div>
    {action}
  </div>
);

/* ------------------------------------------------------------------ */
/* + menu                                                              */
/* ------------------------------------------------------------------ */

const NewModelMenu: React.FC<{
  canSaveSelection: boolean;
  canSaveScene: boolean;
  onSaveModel: (mode: 'selected' | 'all') => void;
  onImportSvg: () => void;
  onImageToModel: () => void;
}> = ({ canSaveSelection, canSaveScene, onSaveModel, onImportSvg, onImageToModel }) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const run = (fn: () => void) => () => {
    fn();
    setOpen(false);
  };
  return (
    <div className="relative" ref={triggerRef}>
      <IconButton icon={<Plus className="w-3.5 h-3.5" />} title="New model" size="xs" isToggled={open} onClick={() => setOpen((v) => !v)} />
      <PopoverMenu isOpen={open} onClose={() => setOpen(false)} position="bottom" align="end" ignoreRef={triggerRef} className="w-52">
        <MenuItem icon={<Box className="w-3.5 h-3.5" />} label="Save Selection" disabled={!canSaveSelection} onSelect={run(() => onSaveModel('selected'))} />
        <MenuItem icon={<Layers className="w-3.5 h-3.5" />} label="Save Whole Scene" disabled={!canSaveScene} onSelect={run(() => onSaveModel('all'))} />
        <MenuDivider />
        <MenuItem icon={<FileUp className="w-3.5 h-3.5" />} label="Import SVG…" onSelect={run(onImportSvg)} />
        <MenuItem icon={<ImagePlus className="w-3.5 h-3.5" />} label="From Image…" onSelect={run(onImageToModel)} />
      </PopoverMenu>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Hover details                                                       */
/* ------------------------------------------------------------------ */

const DetailsHero: React.FC<{ thumb: string | undefined }> = ({ thumb }) => (
  <div className="relative h-[168px] bg-[radial-gradient(ellipse_at_50%_45%,rgba(255,255,255,0.13),rgba(255,255,255,0.02)_60%,transparent_100%)]">
    {thumb ? (
      <img src={thumb} alt="" draggable={false} className="absolute inset-0 w-full h-full object-contain p-3 animate-fade-in drop-shadow-[0_10px_14px_rgba(0,0,0,0.45)]" />
    ) : (
      <div className="absolute inset-0 flex items-center justify-center text-[12.5px] text-white/30">No preview</div>
    )}
  </div>
);

/** Overall size of the solid, visible parts */
function solidSize(parts: ScenePart[]) {
  const solid = parts.filter((p) => p.visible && p.role === 'solid' && p.kind !== 'image_plane');
  if (solid.length === 0) return null;
  const { min, max } = selectionBounds(solid);
  const r = (v: number) => Math.round(v * 10) / 10;
  return { w: r(max[0] - min[0]), h: r(max[1] - min[1]), d: r(max[2] - min[2]) };
}

const fromCatalog = (parts: ScenePart[]) => parts.filter((p) => p.kind === 'component' || p.hardware).length;

const SceneDetails: React.FC<{
  scene: SavedSceneRecord;
  thumb: string | undefined;
  isOpen: boolean;
  isCurrent: boolean;
  onOpen: () => void;
}> = ({ scene, thumb, isOpen, isCurrent, onOpen }) => {
  const parts = scene.parts ?? [];
  const size = useMemo(() => solidSize(scene.parts ?? []), [scene.parts]);
  const comments = scene.annotations?.length ?? 0;
  return (
    <div>
      <DetailsHero thumb={thumb} />
      <Header title={scene.name} subtitle={savedWhen(scene.updatedAt)} description={scene.globalGoal || undefined} />
      <div className="px-4 mt-3 grid grid-cols-2 gap-1.5">
        {size && (
          <Stat label="Size" wide>
            <SizeLine w={size.w} h={size.h} d={size.d} />
          </Stat>
        )}
        <Stat label="Parts">{parts.length}</Stat>
        {fromCatalog(parts) > 0 && <Stat label="From catalog">{fromCatalog(parts)}</Stat>}
        {comments > 0 && <Stat label="Comments">{comments}</Stat>}
      </div>
      {isCurrent ? (
        <div className="h-4" />
      ) : (
        <div className="mt-3 border-t border-white/[0.07] p-3">
          <Button variant="primary" size="sm" fullWidth onClick={onOpen}>
            {isOpen ? 'Show Tab' : 'Open'}
          </Button>
        </div>
      )}
    </div>
  );
};

const MODEL_SOURCE: Record<CustomModelDefinition['sourceType'], string> = {
  'scene-selection': 'Saved from a scene',
  'agent-acp': 'Made by the agent',
  'image-to-3d-acp': 'From an image',
  'sculpt-draw': 'Sketch or sculpt',
};

const ModelDetails: React.FC<{ model: CustomModelDefinition; thumb: string | undefined; onInsert: () => void }> = ({ model, thumb, onInsert }) => {
  const parts = useMemo(() => modelParts(model), [model]);
  const d = model.defaultDimensions;
  return (
    <div>
      <DetailsHero thumb={thumb} />
      <Header
        title={model.name}
        subtitle={`${MODEL_SOURCE[model.sourceType] ?? 'Model'} · ${savedWhen(model.createdAt).replace(/^Saved /, '')}`}
        // “Saved from 52 parts” is what Save to Library writes; Parts below says it better
        description={model.description && !/^Saved from \d+ parts?\.?$/.test(model.description) ? model.description : undefined}
      />
      <div className="px-4 mt-3 grid grid-cols-2 gap-1.5">
        <Stat label="Size" wide>
          <SizeLine w={d.width} h={d.height} d={d.depth} />
        </Stat>
        <Stat label="Parts">{parts.length}</Stat>
        {fromCatalog(parts) > 0 && <Stat label="From catalog">{fromCatalog(parts)}</Stat>}
      </div>
      <div className="mt-3 border-t border-white/[0.07] p-3">
        <Button variant="primary" size="sm" fullWidth onClick={onInsert}>
          Insert
        </Button>
      </div>
    </div>
  );
};
