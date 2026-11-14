import { useState } from 'react';
import { NO_SELECTION, type TrySelection } from '../components/tries/triesSelection';

interface TriesModeOptions {
  caseId: string | null;
  caseRunning: boolean;
}

export function useTriesMode({ caseId, caseRunning }: TriesModeOptions) {
  const [open, setOpen] = useState(false);
  const [robot, setRobot] = useState<string | null>(null);
  const [selection, setSelection] = useState<TrySelection>(NO_SELECTION);
  const [query, setQuery] = useState('');
  const [seen, setSeen] = useState({ caseId, caseRunning });

  const leave = () => {
    setOpen(false);
    setSelection(NO_SELECTION);
  };

  const caseChanged = seen.caseId !== caseId || seen.caseRunning !== caseRunning;
  const caseOpened = (caseId !== null && caseId !== seen.caseId) || (caseRunning && !seen.caseRunning);

  if (caseChanged) setSeen({ caseId, caseRunning });

  if (caseOpened) leave();

  return {
    open,
    robot,
    selection,
    query,
    setQuery,
    show: (focus: string | null) => {
      setOpen(true);
      setRobot(focus);
      setSelection(NO_SELECTION);
    },
    leave,
    select: setSelection,
    clear: () => setSelection(NO_SELECTION),
    back: () => (selection.ids.length > 0 ? setSelection(NO_SELECTION) : leave()),
  };
}

export type TriesMode = ReturnType<typeof useTriesMode>;
