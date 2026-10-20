import { PART_CATALOG, catalogItemFromKey, hardwareVariant } from '../../data/catalog';
import { COMPONENT_BY_ID, ComponentGroup } from '../../data/components';
import { HARDWARE_FAMILIES, HardwareFamily, HardwareSpec, familyOf, makeSpec } from '../../data/hardware';
import type { CatalogItem } from '../../types/robotics';

export type View =
  | { kind: 'home' }
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
  'Linear Actuators',
  'Wheels',
  'Hands',
  'Grippers',
  'Computers',
  'Microcontrollers',
  'Drivers',
  'Power',
  'Sensors',
  'LiDAR',
  'Depth Cameras',
  'Cameras',
  'Displays & Audio',
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

function itemTitle(ref: string): string {
  const item = catalogItemFromKey(ref);
  const c = item?.componentId ? COMPONENT_BY_ID[item.componentId] : undefined;

  return c?.group ?? CATEGORIES.find((cat) => item && cat.items.includes(item))?.title ?? '';
}

function viewTitle(view: View): string {
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

const scopeFilter = (view: View): SearchScope['has'] | null => {
  const group = viewGroup(view);

  if (!group) return null;

  return (i) => groupOf(i) === group;
};

export function searchScope(view: View): SearchScope | null {
  if (view.kind === 'home') return null;

  const has = scopeFilter(view);

  return has ? { label: lowerTitle(viewTitle(view)), has } : null;
}
