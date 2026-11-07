import type { Port } from '../types/ports';
import { registerCatalogComponent } from './catalog';
import {
  COMPONENT_BY_ID,
  COMPONENTS,
  registerComponentMesh,
  type ComponentGroup,
  type ComponentInfo,
} from './components';
import { COMPONENT_PORTS } from './componentPorts';
import { LIST_PRICES } from './listPrices';
import { SUPPLIES, SUPPLY_BY_ID, type SupplyGroup, type SupplyInfo } from './supplies';

export type SourcedKind = 'part' | 'material' | 'equipment';
export type LinkStatus = 'confirmed' | 'store' | 'unconfirmed';
export type ModelSource = 'manufacturer' | 'checked' | 'agent';

export interface SourcedPrice {
  usd: number;
  per: number;
  store: string;
  url: string;
  seen: string;
}

export interface SourcedClaim {
  claim: string;
  url: string;
}

export interface SourcedMesh {
  size: [number, number, number];
  origin?: [number, number, number];
  triangles: number;
  source: ModelSource;
  cadUrl: string;
  license: string;
  ports: Port[];
  rotate?: Array<[string, number]>;
  member?: string;
  sizeProblem?: string;
}

export interface SourcedItem {
  id: string;
  kind: SourcedKind;
  name: string;
  maker: string;
  mpn: string;
  spec: string;
  url: string;
  group?: ComponentGroup;
  mounting?: string;
  weightG?: number;
  price?: SourcedPrice;
  sources: SourcedClaim[];
  addedAt: string;
  link: { status: LinkStatus; checkedAt: string; note?: string };
  mesh?: SourcedMesh;
}

const SUPPLY_GROUP: Record<SourcedKind, SupplyGroup> = { part: 'Electronics', material: 'Wiring', equipment: 'Tools' };
const known = new Map<string, SourcedItem>();
const listeners = new Set<() => void>();
let snapshot: SourcedItem[] = [];

export const sourcedItem = (id: string): SourcedItem | undefined => known.get(id);

export const sourcedItems = (): SourcedItem[] => snapshot;

export function subscribeSourced(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export const isSourcedId = (id: string | undefined): boolean => !!id && known.has(id);

export const sourcedKey = (item: SourcedItem): string => `${item.mesh ? 'component' : 'supply'}:${item.id}`;

export function sourcedIdOfKey(key: string): string | null {
  const match = /^(?:component|supply):([^|]+)/.exec(key);

  return match && known.has(match[1]) ? match[1] : null;
}

function asSupply(item: SourcedItem): SupplyInfo {
  return {
    id: item.id,
    name: item.name,
    group: SUPPLY_GROUP[item.kind],
    spec: `${item.maker} ${item.mpn}. ${item.spec}`,
    search: item.url,
    weightG: item.weightG,
  };
}

function asComponent(item: SourcedItem, mesh: SourcedMesh): ComponentInfo {
  return {
    id: item.id,
    name: item.name,
    manufacturer: item.maker,
    mpn: item.mpn,
    group: item.group ?? 'Sensors',
    description: item.spec,
    specs: item.weightG ? [['Weight', `${item.weightG} g`]] : [],
    mounting: item.mounting ?? item.spec,
    links: { product: item.url },
    model: {
      source: mesh.source,
      by: item.maker,
      checkedAgainst: item.maker,
      url: mesh.cadUrl,
      license: mesh.license,
    },
    color: '#8a8a8a',
    keywords: `${item.spec} added by agent`,
  };
}

function upsert<T extends { id: string }>(list: T[], value: T) {
  const at = list.findIndex((x) => x.id === value.id);

  if (at >= 0) list[at] = value;
  else list.push(value);
}

function registerPart(item: SourcedItem, mesh: SourcedMesh) {
  if (COMPONENT_BY_ID[item.id] && !known.has(item.id)) return;

  const info = asComponent(item, mesh);

  upsert(COMPONENTS, info);
  COMPONENT_BY_ID[item.id] = info;
  COMPONENT_PORTS[item.id] = mesh.ports;
  registerComponentMesh(item.id, mesh.size, mesh.origin);
  registerCatalogComponent(info);
}

function registerSupply(item: SourcedItem) {
  if (SUPPLY_BY_ID[item.id] && !known.has(item.id)) return;

  const info = asSupply(item);

  upsert(SUPPLIES, info);
  SUPPLY_BY_ID[item.id] = info;
}

const isUnchanged = (item: SourcedItem) => {
  const current = known.get(item.id);

  return !!current && JSON.stringify(current) === JSON.stringify(item);
};

export function registerSourced(items: SourcedItem[]) {
  const changed = items.filter((item) => item.url.startsWith('https://') && !isUnchanged(item));

  for (const item of changed) {
    if (item.mesh) registerPart(item, item.mesh);
    else registerSupply(item);

    known.set(item.id, item);

    if (item.price) LIST_PRICES[sourcedKey(item)] = item.price;
  }

  if (!changed.length) return;

  snapshot = [...known.values()];
  listeners.forEach((listener) => listener());
}

export function unreferencedReason(item: SourcedItem, userChecked = false): string | null {
  const linked = item.link.status === 'confirmed' || (item.link.status === 'store' && userChecked);

  if (!linked) return `its link isn't confirmed (${item.link.note ?? item.url})`;

  if (item.mesh?.sizeProblem) return `its CAD doesn't match: ${item.mesh.sizeProblem}`;

  if (!item.sources.length) return 'none of its numbers have a source';

  return item.kind === 'part' && !item.mesh ? 'it takes up space but has no maker geometry (import_maker_cad)' : null;
}
