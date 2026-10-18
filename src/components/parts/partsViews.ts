import { PART_CATALOG, catalogItemFromKey, catalogRef, hardwareVariant } from '../../data/catalog';
import { COMPONENT_BY_ID, ComponentGroup, ComponentInfo } from '../../data/components';
import { HARDWARE_FAMILIES, HardwareFamily, HardwareSpec, familyOf, makeSpec } from '../../data/hardware';
import type { CatalogItem, ScenePart } from '../../types/robotics';

export type View =
  | { kind: 'home' }
  | { kind: 'scene' }
  | { kind: 'category'; id: string }
  | { kind: 'item'; ref: string }
  | { kind: 'hardware'; spec: HardwareSpec };

export interface Category {
  id: string;
  title: string;
  section: 'Components' | 'Hardware';
  items: CatalogItem[];
  family?: HardwareFamily;
}

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

export const hardwareItem = (spec: HardwareSpec): CatalogItem =>
  hardwareVariant(
    PART_CATALOG.find((c) => c.hardware?.type === spec.type)!,
    spec,
  );

const familyItem = (f: HardwareFamily, spec?: HardwareSpec): CatalogItem => {
  const base = PART_CATALOG.find((c) => c.hardware?.type === f.types[0].type)!;

  return hardwareVariant(base, spec ?? makeSpec(f.types[0].type));
};

export const CATEGORIES: Category[] = [
  ...COMPONENT_GROUPS.map((g) => ({
    id: g,
    title: g,
    section: 'Components' as const,
    items: PART_CATALOG.filter((c) => c.componentId && COMPONENT_BY_ID[c.componentId]?.group === g),
  })),
  ...HARDWARE_FAMILIES.map((f) => ({
    id: `hw-${f.id}`,
    title: f.name,
    section: 'Hardware' as const,
    items: [familyItem(f)],
    family: f,
  })),
].filter((c) => c.items.length > 0);

export interface SceneParts {
  used: Array<{ item: CatalogItem; count: number }>;
  related: CatalogItem[];
}

function partRef(p: ScenePart): string | null {
  if (p.componentId) return `component:${p.componentId}`;

  if (p.hardware)
    return `hardware:${p.hardware.type}|${p.hardware.size}|${p.hardware.length ?? ''}|${p.hardware.finish ?? ''}`;

  return null;
}

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

const countRefs = (parts: ScenePart[]): Map<string, number> => {
  const counts = new Map<string, number>();

  for (const p of parts) {
    const ref = partRef(p);

    if (ref) counts.set(ref, (counts.get(ref) ?? 0) + 1);
  }

  return counts;
};

const componentNames = (c: ComponentInfo): string[] =>
  [c.name, ...c.mpn.split(/\s*\/\s*|,\s*/), ...(c.keywords ?? '').split(',')]
    .map((n) => n.trim().toLowerCase())
    .filter((n) => n.length >= 4);

const namedInGoal = (goal: string): string[] => {
  const text = goal.toLowerCase();

  if (!text.trim()) return [];

  return Object.values(COMPONENT_BY_ID)
    .filter((c) => componentNames(c).some((n) => text.includes(n)))
    .map((c) => `component:${c.id}`);
};

export function sceneParts(parts: ScenePart[], goal: string): SceneParts {
  const counts = countRefs(parts);
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

  refs.push(...namedInGoal(goal));

  return { used, related: itemsFor(refs).filter((i) => !usedRefs.has(catalogRef(i))) };
}

function itemTitle(ref: string): string {
  const item = catalogItemFromKey(ref);
  const c = item?.componentId ? COMPONENT_BY_ID[item.componentId] : undefined;

  return c?.group ?? CATEGORIES.find((cat) => item && cat.items.includes(item))?.title ?? '';
}

function viewTitle(view: View): string {
  if (view.kind === 'scene') return 'In this scene';

  if (view.kind === 'category') return CATEGORIES.find((c) => c.id === view.id)?.title ?? '';

  if (view.kind === 'item') return itemTitle(view.ref);

  if (view.kind === 'hardware') return familyOf(view.spec.type).name;

  return '';
}

const lowerTitle = (title: string) => title.replace(/\b[A-Z][a-z]+\b/g, (w) => w.toLowerCase());

const groupOf = (item: CatalogItem): string | undefined => {
  if (item.componentId) return COMPONENT_BY_ID[item.componentId]?.group;

  return item.hardware ? `hw-${familyOf(item.hardware.type).id}` : undefined;
};

const viewGroup = (view: View): string | undefined => {
  if (view.kind === 'category') return view.id;

  if (view.kind === 'hardware') return `hw-${familyOf(view.spec.type).id}`;

  const item = view.kind === 'item' ? catalogItemFromKey(view.ref) : undefined;

  return item && groupOf(item);
};

export interface SearchScope {
  label: string;
  has: (item: CatalogItem) => boolean;
}

const sceneFilter = (scene: SceneParts) => {
  const keys = new Set(
    [...scene.used.map((u) => u.item), ...scene.related].map((i) => i.componentId ?? i.hardware?.type),
  );

  return (item: CatalogItem) => keys.has(item.componentId ?? item.hardware?.type);
};

const scopeFilter = (view: View, scene: SceneParts): SearchScope['has'] | null => {
  if (view.kind === 'scene') return sceneFilter(scene);

  const group = viewGroup(view);

  if (!group) return null;

  return (i) => groupOf(i) === group;
};

export function searchScope(view: View, scene: SceneParts): SearchScope | null {
  if (view.kind === 'home') return null;

  const has = scopeFilter(view, scene);

  return has ? { label: lowerTitle(viewTitle(view)), has } : null;
}
