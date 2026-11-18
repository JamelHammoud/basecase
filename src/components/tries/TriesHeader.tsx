import type { Dataset } from '../../datasets/datasetFile';
import type { TriesView } from '../../workspace/useTriesView';
import { Button, ModeHeader, SearchField } from '../../design-system';

export function TriesHeader({ view, dataset }: { view: TriesView; dataset: Dataset | null }) {
  const onSearchKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Escape') return;

    if (view.query) {
      view.setQuery('');

      return;
    }

    event.stopPropagation();
    event.currentTarget.blur();
  };

  return (
    <ModeHeader
      title={dataset?.name ?? 'Tries'}
      onDone={view.close}
      actions={
        <>
          {view.canCompare && (
            <Button variant="ghost" size="xs" onClick={view.compare}>
              Compare Tries
            </Button>
          )}
          {!dataset && (
            <SearchField
              value={view.query}
              onChange={view.setQuery}
              onKeyDown={onSearchKey}
              placeholder="e.g. failed grasp red block last week"
              aria-label="Search tries"
              className="w-[300px]"
            />
          )}
        </>
      }
    />
  );
}
