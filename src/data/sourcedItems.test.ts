import { describe, expect, it, vi } from 'vitest';
import { specToPart } from '../agent/agentScene';
import { searchCatalog } from '../components/parts/catalogSearch';
import { ADDED_BY_AGENT, partCategories, searchScope } from '../components/parts/partsViews';
import { catalogItemFromKey } from './catalog';
import { COMPONENT_BY_ID } from './components';
import type { CatalogItem } from '../types/robotics';
import {
  registerSourced,
  sourcedItem,
  sourcedItems,
  subscribeSourced,
  type SourcedItem,
  type SourcedMesh,
} from './sourcedItems';

const MESH: SourcedMesh = {
  size: [40, 10, 20],
  triangles: 1200,
  source: 'manufacturer',
  cadUrl: 'https://maker.example/part.step',
  license: 'Maker terms',
  ports: [],
};

const part = (over: Partial<SourcedItem> = {}): SourcedItem => ({
  id: 'zzmaker-flux-9',
  kind: 'part',
  name: 'Flux Capacitor 9',
  maker: 'ZZMaker',
  mpn: 'FLUX-9',
  spec: 'A very specific board',
  url: 'https://maker.example/flux-9',
  group: 'Drivers',
  sources: [{ claim: 'Size', url: 'https://maker.example/flux-9.pdf' }],
  addedAt: '2026-11-07',
  link: { status: 'confirmed', checkedAt: '2026-11-07' },
  mesh: MESH,
  ...over,
});

const addedRow = (sourced = sourcedItems()) => partCategories(sourced).find((c) => c.id === ADDED_BY_AGENT);

describe('parts the agent sources', () => {
  it('resolve as catalog parts, so add_parts can place them', () => {
    registerSourced([part()]);

    const item = catalogItemFromKey('component:zzmaker-flux-9');

    expect(item?.defaultDimensions).toEqual({ width: 40, height: 10, depth: 20 });
    expect(specToPart({ id: 'flux', catalog: 'component:zzmaker-flux-9' }).componentId).toBe('zzmaker-flux-9');
  });

  it('show in the Parts panel: in search, in their group and under Added by Agent', () => {
    registerSourced([part()]);

    const sourced = sourcedItems();
    const ids = (items: Array<{ componentId?: string }>) => items.map((i) => i.componentId);

    expect(ids(searchCatalog('flux-9', sourced))).toContain('zzmaker-flux-9');
    expect(ids(partCategories(sourced).find((c) => c.id === 'Drivers')!.items)).toContain('zzmaker-flux-9');
    expect(ids(addedRow(sourced)!.items)).toContain('zzmaker-flux-9');
  });

  it('scope a search to what the agent added', () => {
    registerSourced([part()]);

    const scope = searchScope({ kind: 'category', id: ADDED_BY_AGENT })!;
    const inScope = (item: CatalogItem) => scope.has({ kind: 'part', item });
    const found = searchCatalog('flux').filter(inScope);

    expect(scope.label).toBe('parts added by agent');
    expect(found.map((i) => i.componentId)).toEqual(['zzmaker-flux-9']);
    expect(searchCatalog('servo').filter(inScope)).toEqual([]);
  });

  it('count a part still waiting for its 3D model, but materials and equipment stay in the BOM', () => {
    registerSourced([
      part({ id: 'no-model-yet', name: 'No Model Yet', mesh: undefined }),
      part({ id: 'some-wire', kind: 'material', mesh: undefined }),
      part({ id: 'a-crimper', kind: 'equipment', mesh: undefined }),
    ]);

    const row = addedRow()!;

    expect(row.count).toBe(row.items.length + 1);
    expect(row.items.map((i) => i.componentId)).not.toContain('no-model-yet');
    expect(row.items.map((i) => i.componentId)).not.toContain('some-wire');
  });

  it('survive a group the panel has no section for', () => {
    registerSourced([part({ id: 'odd-group', name: 'Odd Group Part', group: 'Cables' as SourcedItem['group'] })]);

    expect(catalogItemFromKey('component:odd-group')?.category).toBe('sensors');
    expect(searchCatalog('odd group', sourcedItems()).map((i) => i.componentId)).toContain('odd-group');
  });

  it('notify the panel only when something changed', () => {
    registerSourced([part()]);

    const listener = vi.fn();
    const stop = subscribeSourced(listener);

    registerSourced([part()]);
    expect(listener).not.toHaveBeenCalled();

    registerSourced([part({ spec: 'Now with a better description' })]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(COMPONENT_BY_ID['zzmaker-flux-9'].description).toBe('Now with a better description');
    stop();
  });

  it('turn away a record whose link could run code, as a shared scene might carry', () => {
    const url = ['javascript', 'alert(1)'].join(':');

    registerSourced([part({ id: 'bad-link-record', url })]);

    expect(sourcedItem('bad-link-record')).toBeUndefined();
  });
});
