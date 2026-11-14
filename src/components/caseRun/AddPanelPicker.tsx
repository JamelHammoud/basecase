import { useState } from 'react';
import type { PanelKind } from '../../cases/console/panelKinds';
import type { SignalScope } from '../../cases/console/signalNames';
import { PlusIcon } from '../../design-system';
import type { ConsoleEditing } from '../../workspace/useConsoleEditing';
import { CommandPalette, type Command } from '../CommandPalette';
import { ADDABLE_KINDS, kindLabel, panelChoices } from './panelChoices';

interface AddPanelPickerProps {
  editing: ConsoleEditing;
  names: readonly string[];
  scope: SignalScope;
}

export function AddPanelPicker({ editing, names, scope }: AddPanelPickerProps) {
  const [kind, setKind] = useState<PanelKind | null>(null);
  const area = editing.adding?.area;

  const close = () => {
    setKind(null);
    editing.cancelAdd();
  };

  const choose = (k: PanelKind) => {
    const [only, ...more] = panelChoices(k, names, scope);

    if (only && !more.length) {
      editing.add(only.draft);

      return;
    }

    editing.startAdd(area);
    setKind(k);
  };

  const commands: Command[] = kind
    ? panelChoices(kind, names, scope).map((c) => ({
        id: c.label,
        group: kindLabel(kind),
        label: c.label,
        run: () => editing.add(c.draft),
      }))
    : ADDABLE_KINDS.filter((k) => panelChoices(k, names, scope).length).map((k) => ({
        id: k,
        group: 'Add Panel',
        label: kindLabel(k),
        icon: <PlusIcon />,
        run: () => choose(k),
      }));

  return (
    <div className="contents" onKeyDown={(e) => e.key === 'Escape' && e.stopPropagation()}>
      <CommandPalette key={kind ?? ''} open onClose={close} commands={commands} />
    </div>
  );
}
