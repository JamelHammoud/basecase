import type React from 'react';
import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { catalogRef } from '../../data/catalog';
import { HardwareSpec, familyOf } from '../../data/hardware';
import { useSimReadySearch } from '../../simready/useSimReadySearch';
import type { CatalogItem } from '../../types/robotics';
import { useImportedRobots } from '../../utils/robotPreview';
import type { ObjectCategory } from '../objects/objectCategories';
import { searchInsertables, type Hit } from './insertSearch';
import type { HitActions } from './lists';
import { partCategories, searchScope, type View } from './partsViews';
import { robotEntries, type RobotEntry } from './robotEntries';
import { useSearchKeys } from './useSearchKeys';
import { useSourcedItems } from './useSourcedItems';

export interface PartsReveal {
  section: 'Robots' | 'Objects';
}

export const lastSpecByFamily = new Map<string, HardwareSpec>();

const HOME: View[] = [{ kind: 'home' }];

interface Options {
  onAdd: (item: CatalogItem) => void;
  onInsertRobot: (robot: RobotEntry) => void;
  reveal: PartsReveal | null;
  onRevealed: () => void;
  bodyRef: React.RefObject<HTMLDivElement | null>;
}

interface RevealSection {
  reveal: PartsReveal | null;
  bodyRef: Options['bodyRef'];
  reset: () => void;
  onRevealed: () => void;
}

function useRevealSection({ reveal, bodyRef, reset, onRevealed }: RevealSection) {
  const [shown, setShown] = useState(reveal);
  const revealed = useEffectEvent(onRevealed);

  if (shown !== reveal && reveal) reset();

  if (shown !== reveal) setShown(reveal);

  useEffect(() => {
    if (!reveal) return;

    const header = bodyRef.current?.querySelector(`[data-parts-section="${reveal.section}"]`);

    if (!header?.getClientRects().length) return;

    header.scrollIntoView({ block: 'start' });
    revealed();
  }, [reveal, bodyRef]);
}

export function usePartsSearch({ onAdd, onInsertRobot, reveal, onRevealed, bodyRef }: Options) {
  const sourced = useSourcedItems();
  const remembered = useImportedRobots();
  const robots = robotEntries(remembered);
  const categories = partCategories(sourced);
  const [stack, setStack] = useState<View[]>(HOME);
  const view = stack[stack.length - 1];
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [netQuery, setNetQuery] = useState('');
  const searching = query.trim().length > 0;
  const objectsView = view.kind === 'objects' ? view.category : null;
  const scope = useMemo(() => searchScope(view), [view]);
  const hits = useMemo(() => {
    const all = searchInsertables(query, { sourced, robots });

    return scope ? all.filter(scope.has) : all;
  }, [query, scope, sourced, robots]);
  const objects = useSimReadySearch(objectsView ? `${objectsView.query} ${query}` : '', 'objects', !!objectsView);
  const netScope = !objectsView && (!scope || view.kind === 'robots');
  const net = useSimReadySearch(netQuery, 'all', !!netQuery && netScope, true);

  const search = (q: string) => {
    setQuery(q);
    setActive(0);
    setNetQuery('');
  };
  const open = (next: View) => {
    search('');
    setStack((s) => [...s, next]);
  };
  const back = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  const searchAll = () => setStack(HOME);
  const openPart = (item: CatalogItem) =>
    item.hardware ? open({ kind: 'hardware', spec: item.hardware }) : open({ kind: 'item', ref: catalogRef(item) });
  const openObjects = (category: ObjectCategory) => setStack((s) => [...s, { kind: 'objects', category }]);
  const actions: Omit<HitActions, 'busy'> = {
    onOpenPart: openPart,
    onAddPart: onAdd,
    onInsertRobot,
    onOpenObjects: openObjects,
  };

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [stack.length, searching, bodyRef]);

  useRevealSection({
    reveal,
    bodyRef,
    onRevealed,
    reset: () => {
      setStack(HOME);
      search('');
    },
  });

  const onSearchKey = useSearchKeys({
    query,
    hits,
    active,
    setActive,
    bodyRef,
    actions,
    clear: () => search(''),
    back: stack.length > 1 ? back : null,
    searchNetwork: () => {
      if (objectsView) objects.searchNow();
      else if (netScope) setNetQuery(query.trim());
    },
  });

  return {
    view,
    stack,
    query,
    searching,
    scope,
    hits: objectsView ? ([] as Hit[]) : hits,
    active,
    setActive,
    categories,
    sourced,
    robots,
    objects,
    simready: netQuery ? net : null,
    actions,
    search,
    open,
    back,
    searchAll,
    onSearchKey,
    changeHardware: (spec: HardwareSpec) => {
      lastSpecByFamily.set(familyOf(spec.type).id, spec);
      setStack((s) => [...s.slice(0, -1), { kind: 'hardware', spec }]);
    },
  };
}
