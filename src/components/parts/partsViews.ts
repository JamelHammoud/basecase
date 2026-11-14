import { PART_CATALOG, catalogItemFromKey, hardwareVariant } from '../../data/catalog';
import { COMPONENT_BY_ID, ComponentGroup } from '../../data/components';
import { HARDWARE_FAMILIES, HardwareFamily, HardwareSpec, familyOf, makeSpec } from '../../data/hardware';
import { isSourcedId, sourcedItems, type SourcedItem } from '../../data/sourcedItems';
import type { CatalogItem } from '../../types/robotics';
import type { ObjectCategory } from '../objects/objectCategories';
import type { Hit } from './insertSearch';
import type { RobotGroup } from './robotEntries';

export type View =
  | { kind: 'home' }
  | { kind: 'category'; id: string }
  | { kind: 'item'; ref: string }
  | { kind: 'hardware'; spec: HardwareSpec }
  | { kind: 'robots'; group: RobotGroup }
  | { kind: 'objects'; category: ObjectCategory };

export interface Category {
  id: string;
  title: string;
  section: 'Components' | 'Hardware';
  items: CatalogItem[];
  family?: HardwareFamily;
  count?: number;
  searchLabel?: string;
}

export const ADDED_BY_AGENT = 'added-by-agent';

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

const HARDWARE_CATEGORIES: Category[] = HARDWARE_FAMILIES.map((f) => ({
  id: `hw-${f.id}`,
  title: f.name,
  section: 'Hardware' as const,
  items: [familyItem(f)],
  family: f,
}));

export const isSourcedItem = (item: CatalogItem) => isSourcedId(item.componentId);

export const sourcedPartsToPlace = (): CatalogItem[] => PART_CATALOG.filter(isSourcedItem);

export const sourcedPartsWithoutMesh = (sourced: SourcedItem[]) => sourced.filter((s) => s.kind === 'part' && !s.mesh);

function addedByAgent(sourced: SourcedItem[]): Category[] {
  const items = sourcedPartsToPlace();
  const count = items.length + sourcedPartsWithoutMesh(sourced).length;

  if (!count) return [];

  return [
    {
      id: ADDED_BY_AGENT,
      title: 'Added by Agent',
      section: 'Components',
      items,
      count,
      searchLabel: 'parts added by agent',
    },
  ];
}

const componentCategories = (): Category[] =>
  COMPONENT_GROUPS.map((g) => ({
    id: g,
    title: g,
    section: 'Components' as const,
    items: PART_CATALOG.filter((c) => c.componentId && COMPONENT_BY_ID[c.componentId]?.group === g),
  })).filter((c) => c.items.length > 0);

export const partCategories = (sourced: SourcedItem[]): Category[] => [
  ...addedByAgent(sourced),
  ...componentCategories(),
  ...HARDWARE_CATEGORIES,
];

const findCategory = (id: string) => partCategories(sourcedItems()).find((c) => c.id === id);

function itemTitle(ref: string): string {
  const item = catalogItemFromKey(ref);
  const c = item?.componentId ? COMPONENT_BY_ID[item.componentId] : undefined;

  return c?.group ?? HARDWARE_CATEGORIES.find((cat) => item && cat.items.includes(item))?.title ?? '';
}

function viewTitle(view: View): string {
  if (view.kind === 'category') {
    const category = findCategory(view.id);

    return category?.searchLabel ?? category?.title ?? '';
  }

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
  has: (hit: Hit) => boolean;
}

const scopeFilter = (view: View): ((item: CatalogItem) => boolean) | null => {
  const group = viewGroup(view);

  if (group === ADDED_BY_AGENT) return isSourcedItem;

  if (!group) return null;

  return (i) => groupOf(i) === group;
};

function partScope(view: View): SearchScope | null {
  const has = scopeFilter(view);

  return has ? { label: lowerTitle(viewTitle(view)), has: (hit) => hit.kind === 'part' && has(hit.item) } : null;
}

export function searchScope(view: View): SearchScope | null {
  if (view.kind === 'home') return null;

  if (view.kind === 'robots') {
    return { label: view.group.toLowerCase(), has: (hit) => hit.kind === 'robot' && hit.robot.group === view.group };
  }

  if (view.kind === 'objects') return { label: view.category.title.toLowerCase(), has: () => false };

  return partScope(view);
}
