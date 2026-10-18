import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, ChevronRight, FileText, Plus, ShoppingCart } from 'lucide-react';
import { CATEGORY_LABELS, PART_CATALOG, catalogItemFromKey, catalogRef, hardwareVariant } from '../data/catalog';
import { COMPONENT_BY_ID, ComponentGroup, ComponentInfo } from '../data/components';
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
import { Button, EmptyState, HoverCard, SearchField, Section, SectionHeader, Tooltip, useScrollFade } from '../design-system';
import { CatalogDetails, Hero, LinkButton, SizeLine, SpecRow } from './PartDetails';
import { HardwareConfigurator, HardwareSpecs } from './HardwareConfigurator';
import { keySpecs } from '../utils/keySpecs';

/**
 * Parts: search first, then browse. Home has In this scene (opens what the scene uses and what
 * goes with it) and every category; a category opens a grid; a part opens its page (specs, links, Add); hardware
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
/* Scene suggestions                                                   */
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
  const searchAll = () => setStack([{ kind: 'home' }]);
  const openItem = (item: CatalogItem) =>
    item.hardware ? open({ kind: 'hardware', spec: item.hardware }) : open({ kind: 'item', ref: catalogRef(item) });

  const scene = useMemo(() => sceneParts(parts, goal), [parts, goal]);

  const searching = query.trim().length > 0;
  // New view, or starting/ending a search: start at the top
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [stack.length, searching]);

  // Inside a view, search stays in it ("Search servos"); Home searches every part
  const scope = useMemo(() => searchScope(view, scene), [view, scene]);
  const results = useMemo(() => {
    const all = searchCatalog(query);
    return scope ? all.filter(scope.has) : all;
  }, [query, scope]);
  const search = (q: string) => {
    setQuery(q);
    setActive(0);
  };

  const onSearchKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (query) search('');
      else if (stack.length > 1) back();
      else (e.target as HTMLInputElement).blur();
    } else if (results.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      const next = (active + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
      setActive(next);
      bodyRef.current?.querySelector(`[data-result="${next}"]`)?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault();
      if (e.metaKey) openItem(results[active]);
      else onAdd(results[active]);
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
          placeholder={scope ? `Search ${scope.label}` : 'Search parts'}
          aria-label={scope ? `Search ${scope.label}` : 'Search parts'}
          shortcut="⌘F"
          onBack={stack.length > 1 ? back : undefined}
        />
      </div>

      <div ref={setBody} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden" style={fade.style}>
        {searching ? (
          <SearchResults
            results={results}
            active={active}
            onHover={setActive}
            onOpen={openItem}
            onAdd={onAdd}
            query={query}
            onSearchAll={scope ? searchAll : undefined}
          />
        ) : view.kind === 'home' ? (
          <Home
            scene={scene}
            onOpenScene={() => open({ kind: 'scene' })}
            onOpenCategory={(c) =>
              c.family
                ? open({ kind: 'hardware', spec: lastSpecByFamily.get(c.family.id) ?? makeSpec(c.family.types[0].type) })
                : open({ kind: 'category', id: c.id })
            }
          />
        ) : view.kind === 'scene' ? (
          <ScenePage scene={scene} onOpen={openItem} onAdd={onAdd} />
        ) : view.kind === 'category' ? (
          <TileGrid items={CATEGORIES.find((c) => c.id === view.id)?.items ?? []} onOpen={openItem} onAdd={onAdd} />
        ) : view.kind === 'item' ? (
          <ItemPage ref_={view.ref} onAdd={onAdd} onOpen={openItem} />
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
      {!searching && <PageFooter view={view} onAdd={onAdd} />}
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

/** "Depth Cameras" → "depth cameras", keeping names like LiDAR */
const lowerTitle = (title: string) => title.replace(/\b[A-Z][a-z]+\b/g, (w) => w.toLowerCase());

/** What a search inside this view covers: the category, the part's group, the hardware family or the scene */
function searchScope(view: View, scene: SceneParts): { label: string; has: (item: CatalogItem) => boolean } | null {
  if (view.kind === 'home') return null;
  const groupOf = (item: CatalogItem) =>
    item.componentId ? COMPONENT_BY_ID[item.componentId]?.group : item.hardware ? `hw-${familyOf(item.hardware.type).id}` : undefined;
  let has: (item: CatalogItem) => boolean;
  if (view.kind === 'scene') {
    // Hardware matches by type, since a size in the query makes a new variant
    const keys = new Set([...scene.used.map((u) => u.item), ...scene.related].map((i) => i.componentId ?? i.hardware?.type));
    has = (item) => keys.has(item.componentId ?? item.hardware?.type);
  } else {
    const item = view.kind === 'item' ? catalogItemFromKey(view.ref) : undefined;
    const group =
      view.kind === 'category' ? view.id : view.kind === 'hardware' ? `hw-${familyOf(view.spec.type).id}` : item && groupOf(item);
    if (!group) return null;
    has = (i) => groupOf(i) === group;
  }
  return { label: lowerTitle(viewTitle(view)), has };
}

/* ------------------------------------------------------------------ */
/* Home                                                                */
/* ------------------------------------------------------------------ */

const Home: React.FC<{
  scene: SceneParts;
  onOpenScene: () => void;
  onOpenCategory: (c: Category) => void;
}> = ({ scene, onOpenScene, onOpenCategory }) => (
  <div className="px-[8px] pb-4">
    {(scene.used.length > 0 || scene.related.length > 0) && (
      <div className="mb-3">
        <SceneRow scene={scene} onOpen={onOpenScene} />
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
  <div className={`preview preview-sm ${className}`}>
    {url ? (
      <img src={url} alt="" draggable={false} className="w-full h-full object-contain p-0.5" />
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
  <div className={`grid grid-cols-2 gap-x-[8px] gap-y-[12px] ${flush ? '' : 'px-[12px] pt-1 pb-4'}`}>
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
          className="w-full text-left cursor-default active:scale-[0.98] transition-transform duration-150"
        >
          <div className="preview aspect-[4/3]">
            {thumb ? (
              <img
                src={thumb}
                alt=""
                draggable={false}
                className="w-full h-full object-contain p-1.5 transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] group-hover:scale-[1.06]"
              />
            ) : (
              <div className="w-full h-full bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.04),transparent)] bg-[length:200%_100%] animate-shimmer" />
            )}
          </div>
          <div className="px-0.5 pt-2">
            <div className="text-[13px] font-medium text-white/90 truncate">{item.name}</div>
            <div className="text-[12px] text-white/40 truncate">{metaLine(item)}</div>
          </div>
        </button>
        <AddButton onAdd={onAdd} className="absolute top-[8px] right-[8px] opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity" />
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
  /** How many the scene has */
  count?: number;
}> = ({ item, onOpen, onAdd, active, onHover, index, count }) => {
  const thumb = usePartThumbnail(item);
  return (
    <div
      data-result={index}
      onPointerEnter={onHover}
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
  /** Inside a view: leave it and search every part */
  onSearchAll?: () => void;
}> = ({ results, active, query, onHover, onOpen, onAdd, onSearchAll }) =>
  results.length === 0 ? (
    <EmptyState
      title={`No matches for “${query.trim()}”`}
      action={
        onSearchAll && (
          <Button variant="secondary" size="sm" onClick={onSearchAll}>
            Search All Parts
          </Button>
        )
      }
    />
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
const PAGE_HERO = 'preview !rounded-[14px] mx-[12px] h-[184px]';


/** The page's title block: name, then one muted line */
const PageTitle: React.FC<{ title: string; subtitle: string; description?: string }> = ({ title, subtitle, description }) => (
  <div className="px-[12px] pt-4 pb-4">
    <h2 className="text-[17px] font-semibold text-white/95 leading-tight">{title}</h2>
    <div className="mt-1 text-[13px] text-white/50 truncate">{subtitle}</div>
    {description && <p className="mt-2.5 text-[13px] text-white/70 leading-relaxed">{description}</p>}
  </div>
);

const modelSourceText = (c: ComponentInfo) =>
  (c.model.source === 'manufacturer'
    ? `From ${c.model.by}'s CAD files`
    : c.model.source === 'checked'
      ? `By ${c.model.by}, checked against the ${c.model.checkedAgainst} drawing`
      : `Modeled from the ${c.model.by} drawing`) + (c.model.license ? ` · ${c.model.license}` : '');

/**
 * A part's page: preview, name and what it is first; specs as plain rows; part number,
 * mounting, model source and documents wait in Details. Add and Amazon sit in the footer.
 */
const ItemPage: React.FC<{ ref_: string; onAdd: (i: CatalogItem) => void; onOpen: (i: CatalogItem) => void }> = ({ ref_, onAdd, onOpen }) => {
  const item = catalogItemFromKey(ref_);
  if (!item) return null;
  const c = item.componentId ? COMPONENT_BY_ID[item.componentId] : undefined;
  const d = item.defaultDimensions;
  const pairs = (c?.pairsWith ?? []).map((r) => catalogItemFromKey(r)).filter((i): i is CatalogItem => !!i);
  return (
    <div className="pb-2">
      <Hero item={item} className={PAGE_HERO} {...dragProps(item)} />
      <PageTitle title={item.name} subtitle={c ? c.manufacturer : CATEGORY_LABELS[item.category].label} description={item.description} />
      <div className="border-t border-white/[0.06]">
        {c ? (
          <>
            <Section title="Key specs">
              <dl className="-my-[5px]">
                {keySpecs(c, d).map((k) => (
                  <SpecRow key={k.label} label={k.label}>
                    {k.value}
                  </SpecRow>
                ))}
              </dl>
            </Section>
            <Section title="All specs" collapsible defaultOpen={false}>
              <dl className="-my-[5px]">
                <SpecRow label="Size">
                  <SizeLine w={d.width} h={d.height} d={d.depth} />
                </SpecRow>
                {c.specs.map(([label, value]) => (
                  <SpecRow key={label} label={label}>
                    {value}
                  </SpecRow>
                ))}
              </dl>
            </Section>
          </>
        ) : (
          <Section title="Specs">
            <dl className="-my-[5px]">
              <SpecRow label="Size">
                <SizeLine w={d.width} h={d.height} d={d.depth} />
              </SpecRow>
            </dl>
          </Section>
        )}
        {c && (
          <Section title="Details" collapsible defaultOpen={false}>
            <dl className="-my-[5px]">
              <SpecRow label="Part number">{c.mpn}</SpecRow>
            </dl>
            <DetailBlock label="Mounting">{c.mounting}</DetailBlock>
            <DetailBlock label="3D model">{modelSourceText(c)}</DetailBlock>
            {(c.links.datasheet || c.links.product) && (
              <div className="flex gap-1.5 pt-0.5">
                {c.links.datasheet && (
                  <LinkButton href={c.links.datasheet} icon={<FileText className="w-3.5 h-3.5" />}>
                    Datasheet
                  </LinkButton>
                )}
                {c.links.product && (
                  <LinkButton href={c.links.product} icon={<ArrowUpRight className="w-3.5 h-3.5" />}>
                    Product Page
                  </LinkButton>
                )}
              </div>
            )}
          </Section>
        )}
        {pairs.length > 0 && (
          <Section title="Goes with">
            <div className="-mx-[6px] !mt-0">
              {pairs.map((p) => (
                <ResultRow key={catalogRef(p)} item={p} onOpen={() => onOpen(p)} onAdd={() => onAdd(p)} />
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
};

/** A short paragraph with a muted label above it */
const DetailBlock: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="text-[13px] leading-relaxed">
    <div className="text-white/50">{label}</div>
    <div className="mt-0.5 text-white/80">{children}</div>
  </div>
);

const HardwarePage: React.FC<{ spec: HardwareSpec; onChange: (s: HardwareSpec) => void }> = ({ spec, onChange }) => {
  const item = hardwareVariant(PART_CATALOG.find((c) => c.hardware?.type === spec.type)!, spec);
  return (
    <div className="pb-4">
      <Hero item={item} className={PAGE_HERO} {...dragProps(item)} />
      <PageTitle title={hardwareName(spec)} subtitle={hardwareSubtitle(spec)} />
      <div className="border-t border-white/[0.06]">
        <HardwareConfigurator spec={spec} onChange={(s) => onChange(s)} />
        <HardwareSpecs spec={spec} />
      </div>
    </div>
  );
};

/** The current page's footer: Add, plus Find on Amazon for hardware */
const PageFooter: React.FC<{ view: View; onAdd: (i: CatalogItem) => void }> = ({ view, onAdd }) => {
  if (view.kind === 'item') {
    const item = catalogItemFromKey(view.ref);
    if (!item) return null;
    const amazon = item.componentId ? COMPONENT_BY_ID[item.componentId]?.links.amazon : undefined;
    const label = amazon?.kind === 'product' ? 'Buy on Amazon' : 'Find on Amazon';
    return (
      <AddBar label={item.name} onAdd={() => onAdd(item)}>
        {amazon && (
          <Tooltip label={label}>
            <LinkButton href={amazon.url} icon={<ShoppingCart className="w-3.5 h-3.5" />} label={label} />
          </Tooltip>
        )}
      </AddBar>
    );
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
