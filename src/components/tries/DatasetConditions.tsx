import { useEffect, useRef, useState } from 'react';
import { Button, TextInput } from '../../design-system';
import { confirmAction } from '../../design-system/confirmStore';
import { editImageConditions, type SelectedConditionImage } from '../../workspace/imageConditions';
import type { ImageMembers } from '../../datasets/datasetFile';
import { errorMessage } from '../../utils/errorMessage';
import { plural } from '../../../electron/plural.mjs';

export function DatasetConditions({
  members,
  selected,
}: {
  members: ImageMembers[];
  selected: SelectedConditionImage[];
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const live = useRef(true);

  useEffect(() => {
    live.current = true;

    return () => {
      live.current = false;
    };
  }, []);

  const save = async (remove: boolean) => {
    if (busy || !live.current) return;

    setBusy(true);
    setProblem('');

    try {
      await editImageConditions({ members, selected, name: name.trim(), remove });
    } catch (error) {
      if (live.current) setProblem(errorMessage(error));
    } finally {
      if (live.current) setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 pb-3" data-testid="dataset-conditions">
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-[13px] text-white/60">{plural(selected.length, 'selected image')}</span>
        <TextInput
          aria-label="Condition"
          placeholder="e.g. night"
          maxLength={64}
          value={name}
          disabled={busy}
          onChange={(event) => setName(event.target.value)}
        />
        <Button disabled={busy || !name.trim()} onClick={() => void save(false)}>
          Assign Condition
        </Button>
        <Button
          disabled={busy || !name.trim()}
          onClick={() =>
            confirmAction({
              title: `Delete ${name.trim()}?`,
              onConfirm: () => void save(true),
            })
          }
        >
          Remove Condition
        </Button>
      </div>
      {problem && (
        <p role="status" className="text-[13px] text-white/60">
          {problem}
        </p>
      )}
    </div>
  );
}
