import React, { useState } from 'react';
import { ADDABLE_KINDS, kindLabel, type AddableKind, type PanelChoice } from '../../../cases/console/consoleEdits';
import { MenuBack, MenuDivider, MenuItem, type ContextMenuEntry } from '../../../design-system';
import type { ConsoleEditor } from './consoleEditor';

interface AddPanelProps {
  editor: ConsoleEditor;
  area?: number;
  close: () => void;
}

const ChoiceList: React.FC<{ choices: PanelChoice[]; onPick: (choice: PanelChoice) => void }> = ({
  choices,
  onPick,
}) => (
  <div className="max-h-[360px] overflow-y-auto">
    {choices.map((choice) => (
      <MenuItem key={choice.label} label={choice.label} onSelect={() => onPick(choice)} />
    ))}
  </div>
);

export const AddPanelMenu: React.FC<AddPanelProps> = ({ editor, area, close }) => {
  const [kind, setKind] = useState<AddableKind | null>(null);

  const add = (k: AddableKind, choice: PanelChoice) => {
    close();
    editor.add(k, choice, area);
  };

  if (kind)
    return (
      <div data-testid="add-panel-choices">
        <MenuBack label={kindLabel(kind)} onBack={() => setKind(null)} />
        <MenuDivider />
        <ChoiceList choices={editor.choices(kind)} onPick={(choice) => add(kind, choice)} />
      </div>
    );

  return ADDABLE_KINDS.map((k) => {
    const choices = editor.choices(k);
    const only = choices.length === 1 ? choices[0] : null;

    return (
      <MenuItem
        key={k}
        label={kindLabel(k)}
        disabled={!choices.length}
        onSelect={() => (only ? add(k, only) : setKind(k))}
      />
    );
  });
};

export const addPanelEntries = (editor: ConsoleEditor): ContextMenuEntry[] =>
  ADDABLE_KINDS.map((kind): ContextMenuEntry => {
    const choices = editor.choices(kind);
    const only = choices.length === 1 ? choices[0] : null;

    if (choices.length > 1)
      return {
        label: kindLabel(kind),
        submenu: (close) => (
          <ChoiceList
            choices={choices}
            onPick={(choice) => {
              close();
              editor.add(kind, choice);
            }}
          />
        ),
      };

    return { label: kindLabel(kind), disabled: !only, onSelect: () => only && editor.add(kind, only) };
  });
