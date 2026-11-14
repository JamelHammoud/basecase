import { generatedFrom, withGenerated } from '../../cases/tries';
import { storedTries } from '../../cases/tryStore';
import { confirmAction } from '../../design-system';
import { plural } from '../../../electron/plural.mjs';

export function confirmTriesDelete(ids: string[], onConfirm: (deleted: string[]) => void) {
  const all = storedTries();
  const gone = [...withGenerated(all, ids)];
  const only = ids.length === 1 ? all.find((t) => t.id === ids[0]) : undefined;
  const variations = only ? generatedFrom(all, only).length : 0;

  confirmAction({
    title: ids.length === 1 ? 'Delete this try?' : `Delete ${plural(gone.length, 'try', 'tries')}?`,
    ...(variations ? { body: `Deletes its ${plural(variations, 'variation')} too.` } : {}),
    onConfirm: () => onConfirm([...withGenerated(storedTries(), ids)]),
  });
}
