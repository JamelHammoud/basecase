import { plural } from '../../../electron/plural.mjs';
import type { StoredTry } from '../../cases/storedTry';
import { deleteTries } from '../../cases/tryStore';
import { confirmAction } from '../../design-system';

export function variationsOf(ids: readonly string[], all: readonly StoredTry[]): number {
  const picked = new Set(ids);

  return all.filter((t) => t.sourceTry !== null && picked.has(t.sourceTry) && !picked.has(t.id)).length;
}

export function confirmDeleteTries(
  ids: readonly string[],
  all: readonly StoredTry[],
  onDeleted: (gone: string[]) => void,
) {
  const variations = variationsOf(ids, all);

  confirmAction({
    title: ids.length === 1 ? 'Delete this try?' : `Delete ${plural(ids.length, 'try', 'tries')}?`,
    ...(variations > 0 ? { body: `Deletes its ${plural(variations, 'variation')} too.` } : {}),
    onConfirm: () => void deleteTries(ids).then(onDeleted),
  });
}
