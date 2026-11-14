import React from 'react';
import { NoMatches } from '../../design-system';
import type { SimReadyAsset } from '../../simready/search';
import type { SimReadySearch } from '../../simready/useSimReadySearch';
import type { ObjectCategory } from '../objects/objectCategories';
import { SimReadyGrid } from '../objects/SimReadyGrid';

export const ObjectsView: React.FC<{
  category: ObjectCategory;
  query: string;
  search: SimReadySearch;
  busy: boolean;
  onInsert: (asset: SimReadyAsset) => void;
}> = ({ category, query, search, busy, onInsert }) => {
  if (!search.loading && !search.error && !search.results.length)
    return <NoMatches query={query.trim() || category.title} />;

  return (
    <div className="px-[12px] pt-1 pb-4">
      <SimReadyGrid search={search} busy={busy} onInsert={onInsert} />
    </div>
  );
};
