import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, ChevronLeft, ChevronRight, Plus, Ruler, ShoppingCart, Trash2, X } from 'lucide-react';
import { CATEGORY_LABELS, PART_CATALOG, catalogItemFromKey, catalogRef, hardwareVariant } from '../data/catalog';
import { COMPONENT_BY_ID, ComponentGroup } from '../data/components';
import {
  BEARINGS,
  HARDWARE_BY_TYPE,
  HARDWARE_FAMILIES,
  HardwareFamily,
  HardwareSpec,
  familyOf,
  hardwareName,
  hardwareSubtitle,
  hardwareShopUrl,
  isMetric,
  makeSpec,
} from '../data/hardware';
import { PART_DRAG_TYPE } from '../data/dnd';
import { CatalogItem, ScenePart } from '../types/robotics';
import { usePartThumbnail } from '../three/partThumbnails';
import { Button, ContextMenu, EmptyState, HoverCard, IconButton, SearchField, SectionHeader, Tooltip, useScrollFade } from '../design-system';
import { BuyLinks, CardSection, CatalogDetails, Header, Hero, LinkButton, SizeLine, Stat } from './PartDetails';
import { HardwareConfigurator } from './HardwareConfigurator';

/**
 * Parts: search first, then browse. Home has In this scene (opens what the scene uses and what
 * goes with it), recent parts (right-click to remove) and every
 * category; a category opens a grid; a part opens its page (specs, links, Add); hardware
 * opens a configurator for its family (type, size, any length, finish).
 */

type View =
  | { kind: 'home' }
  | { kind: 'scene' }
  | { kind: 'category'; id: string }
  | { kind: 'item'; ref: string }
  | { kind: 'hardware'; spec: HardwareSpec };

interface Category {
  id: string;
  title: string;
  section: 'Components' | 'Hardware';
  items: CatalogItem[];
  family?: HardwareFamily;
}

/** Browse order; empty groups are hidden */
const COMPONENT_GROUPS: ComponentGroup[] = [
  'Servos',
  'Motors',
  'Hands',
  'Grippers',
  'Computers',
  'Microcontrollers',
  'Drivers',
  'Sensors',
  'LiDAR',
  'Depth Cameras',
  'Cameras',
];

/** Default variant shown for a hardware family */
const familyItem = (f: HardwareFamily, spec?: HardwareSpec): CatalogItem => {
  const base = PART_CATALOG.find((c) => c.hardware?.type === f.types[0].type)!;
  return hardwareVariant(base, spec ?? makeSpec(f.types[0].type));
};

const CATEGORIES: Category[] = [
  ...COMPONENT_GROUPS.map((g) => ({
    id: g,
    title: g,
    section: 'Components' as const,
    items: PART_CATALOG.filter((c) => c.componentId && COMPONENT_BY_ID[c.componentId]?.group === g),
  })),
  ...HARDWARE_FAMILIES.map((f) => ({ id: `hw-${f.id}`, title: f.name, section: 'Hardware' as const, items: [familyItem(f)], family: f })),
].filter((c) => c.items.length > 0);

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

/** Extra words people search with, per hardware family */
const FAMILY_WORDS: Record<string, string> = {
  screws: 'screw bolt cap fastener',
  nuts: 'nut nylock',
  washers: 'washer',
  inserts: 'insert threaded heat set',
  standoffs: 'standoff spacer pcb',
  pins: 'pin dowel axle shaft',
  bearings: 'bearing ball',
};

/** Words that also find a component group */
const GROUP_WORDS: Partial<Record<ComponentGroup, string>> = {
  Servos: 'servo motor actuator joint',
  Motors: 'motor stepper gearmotor dc',
  Hands: 'hand finger dexterous end effector',
  Grippers: 'gripper claw end effector',
  LiDAR: 'lidar laser scanner range',
  'Depth Cameras': 'depth camera stereo 3d vision',
  Computers: 'computer board sbc linux',
  Microcontrollers: 'microcontroller mcu board arduino',
  Drivers: 'driver board controller',
  Sensors: 'sensor',
  Cameras: 'camera vision',
};

interface Indexed {
  item: CatalogItem;
  name: string;
  text: string;
  /** Group or family words: a query word here ranks the part higher ("servo" → servos first) */
  group: string;
}

/** Parts lists real components and hardware only; shapes, cutouts and guides live in the toolbar, ⌘K and right-click */
const inParts = (item: CatalogItem) => !!item.componentId || !!item.hardware;

const INDEX: Indexed[] = PART_CATALOG.filter(inParts).map((item) => {
  const c = item.componentId ? COMPONENT_BY_ID[item.componentId] : undefined;
  const h = item.hardware;
  const fam = h ? familyOf(h.type) : undefined;
  const text = [
    item.name,
    item.description,
    item.keywords,
    CATEGORY_LABELS[item.category].label,
    c ? `${c.group} ${GROUP_WORDS[c.group] ?? ''}` : '',
    // Only this type's own label, so "flat" finds countersunk screws and not every screw
    fam ? `${fam.name} ${FAMILY_WORDS[fam.id]} ${fam.types.find((t) => t.type === h!.type)?.label ?? ''}` : '',
  ]
    .join(' ')
    .toLowerCase();
  const group = (c ? `${c.group} ${GROUP_WORDS[c.group] ?? ''}` : fam ? `${fam.name} ${FAMILY_WORDS[fam.id]}` : CATEGORY_LABELS[item.category].label).toLowerCase();
  return { item, name: item.name.toLowerCase(), text, group };
});

const escapeRe = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Words under 3 characters must start a word ("5" finds "Pi 5", not "65 mm"); longer ones can sit anywhere ("3215") */
const wordMatcher = (w: string) => {
  const re = new RegExp(`(^|[^a-z0-9])${escapeRe(w)}`);
  return (text: string) => (w.length >= 3 ? text.includes(w) : re.test(text));
};

/** "m3x12", "M2.5 × 8", "m3 12mm", "608" → size and length, plus the words left over */
function parseSizeQuery(q: string): { size?: string; length?: number; words: string[] } {
  let rest = q.toLowerCase().replace(/[×*]/g, 'x');
  let size: string | undefined;
  let length: number | undefined;
  const m = rest.match(/\bm(\d+(?:\.\d)?)(?:\s*x\s*(\d+(?:\.\d+)?)\s*(?:mm)?)?\b/);
  if (m && isMetric(`M${m[1]}`)) {
    size = `M${m[1]}`;
    if (m[2]) length = Number(m[2]);
    rest = rest.replace(m[0], ' ');
  } else {
    const bearing = Object.keys(BEARINGS).find((b) => new RegExp(`\\b${b.toLowerCase()}\\b`).test(rest));
    if (bearing) {
      size = bearing;
      rest = rest.replace(new RegExp(`\\b${bearing.toLowerCase()}\\b`), ' ');
    }
  }
  let words = rest.split(/\s+/).filter(Boolean);
  if (size && length === undefined) {
    const n = words.find((w) => /^\d+(?:\.\d+)?(?:mm)?$/.test(w));
    if (n) {
      length = parseFloat(n);
      words = words.filter((w) => w !== n);
    }
  }
  return { size, length, words };
}

/** Ranked matches; a size in the query turns hardware results into that exact part */
function searchCatalog(query: string): CatalogItem[] {
  const { size, length, words } = parseSizeQuery(query.trim());
  const matchers = words.map(wordMatcher);
  const matches = (e: Indexed) => matchers.every((m) => m(e.text));
  if (size) {
    return INDEX.filter((e) => {
      const h = e.item.hardware;
      if (!h || !HARDWARE_BY_TYPE[h.type].sizes.includes(size)) return false;
      if (length !== undefined && !HARDWARE_BY_TYPE[h.type].lengths) return false;
      return matches(e);
    }).map((e) => hardwareVariant(e.item, makeSpec(e.item.hardware!.type, size, length)));
  }
  if (words.length === 0) return [];
  const q = words.join(' ');
  return INDEX.filter(matches)
    .map((e, i) => ({
      e,
      score:
        (e.name.startsWith(q) ? 10 : 0) +
        matchers.reduce((n, m) => n + (m(e.name) ? 3 : 1) + (m(e.group) ? 4 : 0), 0) -
        i / 1000,
    }))
    .sort((a, b) => b.score - a.score)
    .map(({ e }) => e.item);
}

/* ------------------------------------------------------------------ */
/* Scene suggestions and recents                                       */
/* ------------------------------------------------------------------ */

/** Ref of the catalog entry a scene part came from, at its exact spec */
function partRef(p: ScenePart): string | null {
  if (p.componentId) return `component:${p.componentId}`;
  if (p.hardware) return `hardware:${p.hardware.type}|${p.hardware.size}|${p.hardware.length ?? ''}|${p.hardware.finish ?? ''}`;
  return null;
}

/** Catalog entries for a list of refs, without duplicates */
function itemsFor(refs: string[]): CatalogItem[] {
  const seen = new Set<string>();
  const items: CatalogItem[] = [];
  for (const ref of refs) {
    const item = catalogItemFromKey(ref);
    if (!item || seen.has(catalogRef(item))) continue;
    seen.add(catalogRef(item));
    items.push(item);
  }
  return items;
}

interface SceneParts {
  /** Real components and hardware in the scene, with how many of each */
  used: Array<{ item: CatalogItem; count: number }>;
  /** What goes with them (`pairsWith`), then components named in the brief */
  related: CatalogItem[];
}

function sceneParts(parts: ScenePart[], goal: string): SceneParts {
  const counts = new Map<string, number>();
  for (const p of parts) {
    const ref = partRef(p);
    if (ref) counts.set(ref, (counts.get(ref) ?? 0) + 1);
  }
  const used = [...counts].flatMap(([ref, count]) => {
    const item = catalogItemFromKey(ref);
    return item ? [{ item, count }] : [];
  });
  const usedRefs = new Set(used.map((u) => catalogRef(u.item)));
  const refs: string[] = [];
  for (const ref of counts.keys()) {
    const c = ref.startsWith('component:') ? COMPONENT_BY_ID[ref.slice(10)] : undefined;
    refs.push(...(c?.pairsWith ?? []));
  }
  const text = goal.toLowerCase();
  if (text.trim())
    for (const c of Object.values(COMPONENT_BY_ID)) {
      const names = [c.name, ...c.mpn.split(/\s*\/\s*|,\s*/), ...(c.keywords ?? '').split(',')]
        .map((n) => n.trim().toLowerCase())
        .filter((n) => n.length >= 4);
      if (names.some((n) => text.includes(n))) refs.push(`component:${c.id}`);
    }
  return { used, related: itemsFor(refs).filter((i) => !usedRefs.has(catalogRef(i))) };
}

const RECENT_KEY = 'parts-recent';
const loadRecent = (): string[] => {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((r) => typeof r === 'string') : [];
  } catch {
    return [];
  }
};

const saveRecent = (list: string[]) => {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable */
  }
};

/** Last spec picked in each hardware family, so coming back keeps your choices */
const lastSpecByFamily = new Map<string, HardwareSpec>();

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

export const PartsPanel: React.FC<{
  onAdd: (item: CatalogItem) => void;
  parts: ScenePart[];
  goal: string;
  /** Lets the scene focus the search field (⌘F) */
  searchInputRef?: React.MutableRefObject<HTMLInputElement | null>;
}> = ({ onAdd, parts, goal, searchInputRef }) => {
  const [stack, setStack] = useState<View[]>([{ kind: 'home' }]);
  const view = stack[stack.length - 1];
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const setSearchRef = useCallback(
    (node: HTMLInputElement | null) => {
      if (searchInputRef) searchInputRef.current = node;
    },
    [searchInputRef]
  );
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const fade = useScrollFade();
  const setBody = useCallback(
    (node: HTMLDivElement | null) => {
      bodyRef.current = node;
      fade.ref(node);
    },
    // fade.ref is a state setter (stable)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const open = (next: View) => {
    setQuery('');
    setStack((s) => [...s, next]);
  };
  const back = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  const openItem = (item: CatalogItem) =>
    item.hardware ? open({ kind: 'hardware', spec: item.hardware }) : open({ kind: 'item', ref: catalogRef(item) });

  const add = (item: CatalogItem) => {
    onAdd(item);
    const ref = catalogRef(item);
    setRecent((prev) => {
      const next = [ref, ...prev.filter((r) => r !== ref)].slice(0, 6);
      saveRecent(next);
      return next;
    });
  };
  const removeRecent = (ref: string | null) =>
    setRecent((prev) => {
      const next = ref ? prev.filter((r) => r !== ref) : [];
      saveRecent(next);
      return next;
    });
  const [recentMenu, setRecentMenu] = useState<{ x: number; y: number; ref: string } | null>(null);
  const scene = useMemo(() => sceneParts(parts, goal), [parts, goal]);

  const searching = query.trim().length > 0;
  // New view, or starting/ending a search: start at the top
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [stack.length, searching]);

  const results = useMemo(() => searchCatalog(query), [query]);
  const search = (q: string) => {
    setQuery(q);
    setActive(0);
  };

  const onSearchKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (query) search('');
      else (e.target as HTMLInputElement).blur();
    } else if (results.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      const next = (active + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
      setActive(next);
      bodyRef.current?.querySelector(`[data-result="${next}"]`)?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault();
      if (e.metaKey) openItem(results[active]);
      else add(results[active]);
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-[12px] pb-[10px] shrink-0">
        <SearchField
          ref={setSearchRef}
          value={query}
          onChange={search}
          onKeyDown={onSearchKey}
          placeholder="Search parts"
          aria-label="Search parts"
          shortcut="⌘F"
        />
      </div>

      {!searching && view.kind !== 'home' && (
        <div className="px-2 pb-1 shrink-0 flex items-center gap-1 min-h-9">
          <IconButton icon={<ChevronLeft className="w-4 h-4" />} title="Back" size="sm" onClick={back} />
          <div className="min-w-0 flex-1 text-[15px] font-semibold text-white/90 truncate">{viewTitle(view)}</div>
        </div>
      )}

      <div ref={setBody} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden" style={fade.style}>
        {searching ? (
          <SearchResults results={results} active={active} onHover={setActive} onOpen={openItem} onAdd={add} query={query} />
        ) : view.kind === 'home' ? (
          <Home
            scene={scene}
            onOpenScene={() => open({ kind: 'scene' })}
            recent={recent.map((r) => catalogItemFromKey(r)).filter((i): i is CatalogItem => !!i && inParts(i)).slice(0, 5)}
            onRecentMenu={(item, e) => {
              e.preventDefault();
              setRecentMenu({ x: e.clientX, y: e.clientY, ref: catalogRef(item) });
            }}
            onOpenCategory={(c) =>
              c.family
                ? open({ kind: 'hardware', spec: lastSpecByFamily.get(c.family.id) ?? makeSpec(c.family.types[0].type) })
                : open({ kind: 'category', id: c.id })
            }
            onOpen={openItem}
            onAdd={add}
          />
        ) : view.kind === 'scene' ? (
          <ScenePage scene={scene} onOpen={openItem} onAdd={add} />
        ) : view.kind === 'category' ? (
          <TileGrid items={CATEGORIES.find((c) => c.id === view.id)?.items ?? []} onOpen={openItem} onAdd={add} />
        ) : view.kind === 'item' ? (
          <ItemPage ref_={view.ref} onAdd={add} onOpen={openItem} />
        ) : (
          <HardwarePage
            spec={view.spec}
            onChange={(spec) => {
              lastSpecByFamily.set(familyOf(spec.type).id, spec);
              setStack((s) => [...s.slice(0, -1), { kind: 'hardware', spec }]);
            }}
          />
        )}
      </div>
      {!searching && <PageFooter view={view} onAdd={add} />}
      {recentMenu && (
        <ContextMenu
          x={recentMenu.x}
          y={recentMenu.y}
          onClose={() => setRecentMenu(null)}
          items={[
            { label: 'Remove from Recent', icon: <X className="w-3.5 h-3.5" />, onSelect: () => removeRecent(recentMenu.ref) },
            { label: 'Clear Recent', icon: <Trash2 className="w-3.5 h-3.5" />, tone: 'danger', onSelect: () => removeRecent(null) },
          ]}
        />
      )}
    </div>
  );
};

function viewTitle(view: View): string {
  if (view.kind === 'scene') return 'In this scene';
  if (view.kind === 'category') return CATEGORIES.find((c) => c.id === view.id)?.title ?? '';
  if (view.kind === 'item') {
    // The page shows the name; the header says where it lives
    const item = catalogItemFromKey(view.ref);
    const c = item?.componentId ? COMPONENT_BY_ID[item.componentId] : undefined;
    return c?.group ?? CATEGORIES.find((cat) => item && cat.items.includes(item))?.title ?? '';
  }
  if (view.kind === 'hardware') return familyOf(view.spec.type).name;
  return '';
}

/* ------------------------------------------------------------------ */
/* Home                                                                */
/* ------------------------------------------------------------------ */

const Home: React.FC<{
  scene: SceneParts;
  onOpenScene: () => void;
  recent: CatalogItem[];
  onRecentMenu: (item: CatalogItem, e: React.MouseEvent) => void;
  onOpenCategory: (c: Category) => void;
  onOpen: (item: CatalogItem) => void;
  onAdd: (item: CatalogItem) => void;
}> = ({ scene, onOpenScene, recent, onRecentMenu, onOpenCategory, onOpen, onAdd }) => (
  <div className="px-[8px] pb-4">
    {(scene.used.length > 0 || scene.related.length > 0) && (
      <div className="mb-3">
        <SceneRow scene={scene} onOpen={onOpenScene} />
      </div>
    )}
    {recent.length > 0 && (
      <div className="mb-3">
        <SectionHeader title="Recent" />
        {recent.map((item) => (
          <ResultRow
            key={catalogRef(item)}
            item={item}
            onOpen={() => onOpen(item)}
            onAdd={() => onAdd(item)}
            onContextMenu={(e) => onRecentMenu(item, e)}
          />
        ))}
      </div>
    )}
    {(['Components', 'Hardware'] as const).map((section) => (
      <div key={section} className="mb-3">
        <SectionHeader title={section} />
        {CATEGORIES.filter((c) => c.section === section).map((c) => (
          <CategoryRow key={c.id} category={c} onOpen={() => onOpenCategory(c)} />
        ))}
      </div>
    ))}
  </div>
);

/** "In this scene": the real parts you've used, and what goes with them */
const SceneRow: React.FC<{ scene: SceneParts; onOpen: () => void }> = ({ scene, onOpen }) => {
  const thumb = usePartThumbnail(scene.used[0]?.item ?? scene.related[0]);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group w-full flex items-center gap-3 h-[52px] px-1.5 rounded-xl text-left cursor-default hover:bg-white/[0.05] active:scale-[0.99] transition-[background-color,transform] duration-150"
    >
      <Thumb url={thumb} className="w-12 h-9 shrink-0" />
      <div className="min-w-0 flex-1 text-[13.5px] font-medium text-white/90 truncate">In this scene</div>
      <ChevronRight className="w-4 h-4 text-white/25 group-hover:text-white/50 shrink-0 transition-colors" />
    </button>
  );
};

const ScenePage: React.FC<{
  scene: SceneParts;
  onOpen: (item: CatalogItem) => void;
  onAdd: (item: CatalogItem) => void;
}> = ({ scene, onOpen, onAdd }) =>
  scene.used.length === 0 && scene.related.length === 0 ? (
    <EmptyState title="No parts in this scene" />
  ) : (
    <div className="px-[8px] pb-4">
      {scene.used.length > 0 && (
        <div className="mb-3">
          <SectionHeader title="Used" />
          {scene.used.map(({ item, count }) => (
            <ResultRow key={catalogRef(item)} item={item} count={count} onOpen={() => onOpen(item)} onAdd={() => onAdd(item)} />
          ))}
        </div>
      )}
      {scene.related.length > 0 && (
        <div className="mb-3">
          <SectionHeader title={scene.used.length > 0 ? 'Goes with these' : 'Named in the description'} />
          {scene.related.map((item) => (
            <ResultRow key={catalogRef(item)} item={item} onOpen={() => onOpen(item)} onAdd={() => onAdd(item)} />
          ))}
        </div>
      )}
    </div>
  );

const CategoryRow: React.FC<{ category: Category; onOpen: () => void }> = ({ category, onOpen }) => {
  const thumb = usePartThumbnail(category.items[0]);
  const meta = category.family
    ? category.family.description
    : `${category.items.length} ${category.items.length === 1 ? 'part' : 'parts'}`;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group w-full flex items-center gap-3 h-[52px] px-1.5 rounded-xl text-left cursor-default hover:bg-white/[0.05] active:scale-[0.99] transition-[background-color,transform] duration-150"
    >
      <Thumb url={thumb} className="w-12 h-9 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-medium text-white/90 truncate">{category.title}</div>
        <div className="text-[12px] text-white/40 truncate">{meta}</div>
      </div>
      <ChevronRight className="w-4 h-4 text-white/25 group-hover:text-white/50 shrink-0 transition-colors" />
    </button>
  );
};

/* ------------------------------------------------------------------ */
/* Tiles and rows                                                      */
/* ------------------------------------------------------------------ */

const Thumb: React.FC<{ url?: string; className?: string }> = ({ url, className = '' }) => (
  <div className={`rounded-lg bg-white/[0.035] ring-1 ring-inset ring-white/[0.05] overflow-hidden ${className}`}>
    {url ? (
      <img src={url} alt="" draggable={false} className="w-full h-full object-contain" />
    ) : (
      <div className="w-full h-full bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.04),transparent)] bg-[length:200%_100%] animate-shimmer" />
    )}
  </div>
);

/** Short second line: maker for components, spec for hardware, size otherwise */
function metaLine(item: CatalogItem): string {
  const c = item.componentId ? COMPONENT_BY_ID[item.componentId] : undefined;
  if (c) return c.manufacturer;
  const h = item.hardware;
  if (h) return HARDWARE_BY_TYPE[h.type].description;
  const d = item.defaultDimensions;
  return `${d.width} × ${d.height} × ${d.depth} mm`;
}

const dragProps = (item: CatalogItem) => ({
  draggable: true,
  onDragStart: (e: React.DragEvent) => {
    e.dataTransfer.setData(PART_DRAG_TYPE, catalogRef(item));
    e.dataTransfer.effectAllowed = 'copy';
    const img = (e.currentTarget as HTMLElement).querySelector('img');
    if (img) e.dataTransfer.setDragImage(img, img.width / 2, img.height / 2);
  },
});

const AddButton: React.FC<{ onAdd: () => void; className?: string }> = ({ onAdd, className = '' }) => (
  <Tooltip label="Add" className={className}>
    <button
      type="button"
      aria-label="Add"
      onClick={(e) => {
        e.stopPropagation();
        onAdd();
      }}
      className="w-7 h-7 rounded-full bg-[#0d99ff] text-white flex items-center justify-center cursor-default shadow-[0_2px_6px_rgba(0,0,0,0.4)] hover:bg-[#2ba5ff] active:scale-[0.94] transition-[background-color,transform] duration-150"
    >
      <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
    </button>
  </Tooltip>
);

const TileGrid: React.FC<{ items: CatalogItem[]; onOpen: (i: CatalogItem) => void; onAdd: (i: CatalogItem) => void; flush?: boolean }> = ({
  items,
  onOpen,
  onAdd,
  flush,
}) => (
  <div className={`grid grid-cols-2 gap-1 ${flush ? '' : 'px-[8px] pb-4'}`}>
    {items.map((item) => (
      <Tile key={catalogRef(item)} item={item} onOpen={() => onOpen(item)} onAdd={() => onAdd(item)} />
    ))}
  </div>
);

const Tile: React.FC<{ item: CatalogItem; onOpen: () => void; onAdd: () => void }> = ({ item, onOpen, onAdd }) => {
  const thumb = usePartThumbnail(item);
  return (
    <HoverCard content={() => <CatalogDetails item={item} />} beside="aside" className="w-full">
      <div className="group relative w-full" {...dragProps(item)}>
        <button
          type="button"
          onClick={onOpen}
          className="w-full text-left rounded-xl p-1 cursor-default hover:bg-white/[0.04] active:scale-[0.98] transition-[background-color,transform] duration-150"
        >
          <div className="aspect-[4/3] rounded-lg bg-white/[0.035] ring-1 ring-inset ring-white/[0.04] group-hover:bg-white/[0.06] group-hover:ring-white/[0.08] overflow-hidden transition-colors">
            {thumb ? (
              <img
                src={thumb}
                alt=""
                draggable={false}
                className="w-full h-full object-contain transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] group-hover:scale-[1.06]"
              />
            ) : (
              <div className="w-full h-full bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.04),transparent)] bg-[length:200%_100%] animate-shimmer" />
            )}
          </div>
          <div className="px-0.5 pt-1.5 pb-0.5">
            <div className="text-[13px] font-medium text-white/90 truncate">{item.name}</div>
            <div className="text-[12px] text-white/40 truncate">{metaLine(item)}</div>
          </div>
        </button>
        <AddButton onAdd={onAdd} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity" />
      </div>
    </HoverCard>
  );
};

const ResultRow: React.FC<{
  item: CatalogItem;
  onOpen: () => void;
  onAdd: () => void;
  active?: boolean;
  onHover?: () => void;
  index?: number;
  onContextMenu?: (e: React.MouseEvent) => void;
  /** How many the scene has */
  count?: number;
}> = ({ item, onOpen, onAdd, active, onHover, index, onContextMenu, count }) => {
  const thumb = usePartThumbnail(item);
  return (
    <div
      data-result={index}
      onPointerEnter={onHover}
      onContextMenu={onContextMenu}
      className={`group relative rounded-xl transition-colors ${active ? 'bg-white/[0.07]' : 'hover:bg-white/[0.05]'}`}
      {...dragProps(item)}
    >
      <button type="button" onClick={onOpen} className="w-full flex items-center gap-3 h-[52px] px-1.5 pr-11 text-left cursor-default">
        <Thumb url={thumb} className="w-12 h-9 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-medium text-white/90 truncate">{item.name}</div>
          <div className="text-[12px] text-white/40 truncate">{metaLine(item)}</div>
        </div>
        {count !== undefined && count > 1 && <span className="shrink-0 text-[12.5px] text-white/45 tabular">×{count}</span>}
      </button>
      <AddButton
        onAdd={onAdd}
        className={`absolute right-2 top-1/2 -translate-y-1/2 transition-opacity ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
      />
    </div>
  );
};

const SearchResults: React.FC<{
  results: CatalogItem[];
  active: number;
  query: string;
  onHover: (i: number) => void;
  onOpen: (item: CatalogItem) => void;
  onAdd: (item: CatalogItem) => void;
}> = ({ results, active, query, onHover, onOpen, onAdd }) =>
  results.length === 0 ? (
    <EmptyState title={`No matches for “${query.trim()}”`} />
  ) : (
    <div className="px-[8px] pb-4">
      <SectionHeader title={`${results.length} ${results.length === 1 ? 'result' : 'results'}`} />
      {results.map((item, i) => (
        <ResultRow
          key={catalogRef(item)}
          index={i}
          item={item}
          active={i === active}
          onHover={() => onHover(i)}
          onOpen={() => onOpen(item)}
          onAdd={() => onAdd(item)}
        />
      ))}
    </div>
  );

/* ------------------------------------------------------------------ */
/* Part page                                                           */
/* ------------------------------------------------------------------ */

/** Footer with the primary action, below the scroll area (so the scroll fade never dims it) */
const AddBar: React.FC<{ label: string; onAdd: () => void; children?: React.ReactNode }> = ({ label, onAdd, children }) => (
  <div className="shrink-0 px-[12px] py-3 border-t border-white/[0.06] flex items-center gap-2">
    <div className="min-w-0 flex-1 text-[13px] text-white/60 truncate">{label}</div>
    {children}
    <Button variant="primary" size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={onAdd}>
      Add
    </Button>
  </div>
);

/** Hero for a page: rounded, inset, draggable onto the canvas */
const PAGE_HERO = 'mx-3 h-[184px] rounded-2xl ring-1 ring-inset ring-white/[0.06] overflow-hidden';

const ItemPage: React.FC<{ ref_: string; onAdd: (i: CatalogItem) => void; onOpen: (i: CatalogItem) => void }> = ({ ref_, onAdd, onOpen }) => {
  const item = catalogItemFromKey(ref_);
  if (!item) return null;
  const c = item.componentId ? COMPONENT_BY_ID[item.componentId] : undefined;
  const d = item.defaultDimensions;
  const pairs = (c?.pairsWith ?? []).map((r) => catalogItemFromKey(r)).filter((i): i is CatalogItem => !!i);
  return (
    <div className="pb-4">
      <Hero item={item} source={c} className={PAGE_HERO} {...dragProps(item)} />
      <Header
        title={item.name}
        subtitle={c ? `${c.manufacturer} · ${c.mpn}` : CATEGORY_LABELS[item.category].label}
        description={item.description}
        clamp={false}
      />
      <div className="px-[12px] mt-3 grid grid-cols-2 gap-1.5">
        <Stat label="Size" wide>
          <SizeLine w={d.width} h={d.height} d={d.depth} />
        </Stat>
        {(c?.specs ?? []).map(([label, value]) => (
          <Stat key={label} label={label} clamp={false}>
            {value}
          </Stat>
        ))}
      </div>
      {c && (
        <>
          <CardSection icon={<Ruler className="w-3.5 h-3.5" />} label="Mounting" clamp={false}>
            {c.mounting}
          </CardSection>
          <CardSection icon={<Box className="w-3.5 h-3.5" />} label="3D model" clamp={false}>
            {c.model.source === 'manufacturer'
              ? `From ${c.model.by}'s CAD files`
              : c.model.source === 'checked'
                ? `By ${c.model.by}, checked against the ${c.model.checkedAgainst} drawing`
                : `Modeled from the ${c.model.by} drawing`}
            {c.model.license ? ` · ${c.model.license}` : ''}
          </CardSection>
          <div className="mt-3 px-[12px] flex items-center gap-1.5">
            <BuyLinks c={c} primary={false} />
          </div>
        </>
      )}
      {pairs.length > 0 && (
        <div className="mt-4 border-t border-white/[0.07] pt-2 px-[8px]">
          <SectionHeader title="Goes with" />
          {pairs.map((p) => (
            <ResultRow key={catalogRef(p)} item={p} onOpen={() => onOpen(p)} onAdd={() => onAdd(p)} />
          ))}
        </div>
      )}
    </div>
  );
};

const HardwarePage: React.FC<{ spec: HardwareSpec; onChange: (s: HardwareSpec) => void }> = ({ spec, onChange }) => {
  const item = hardwareVariant(PART_CATALOG.find((c) => c.hardware?.type === spec.type)!, spec);
  return (
    <div className="pb-4">
      <Hero item={item} source="iso" className={PAGE_HERO} {...dragProps(item)} />
      <Header title={hardwareName(spec)} subtitle={hardwareSubtitle(spec)} clamp={false} />
      <div className="mt-3 border-t border-white/[0.07] px-[12px] pt-3">
        <HardwareConfigurator spec={spec} onChange={(s) => onChange(s)} />
      </div>
    </div>
  );
};

/** The current page's footer: Add, plus Find on Amazon for hardware */
const PageFooter: React.FC<{ view: View; onAdd: (i: CatalogItem) => void }> = ({ view, onAdd }) => {
  if (view.kind === 'item') {
    const item = catalogItemFromKey(view.ref);
    return item ? <AddBar label={item.name} onAdd={() => onAdd(item)} /> : null;
  }
  if (view.kind !== 'hardware') return null;
  const { spec } = view;
  const item = hardwareVariant(PART_CATALOG.find((c) => c.hardware?.type === spec.type)!, spec);
  return (
    <AddBar label={hardwareName(spec)} onAdd={() => onAdd(item)}>
      <Tooltip label="Find on Amazon">
        <LinkButton href={hardwareShopUrl(spec)} icon={<ShoppingCart className="w-3.5 h-3.5" />} label="Find on Amazon" />
      </Tooltip>
    </AddBar>
  );
};
