import React, { useState } from 'react';
import { ADDABLE_KINDS, kindLabel, type PanelChoice } from '../../../cases/console/consoleEdits';
import { MenuBack, MenuDivider, MenuItem, type ContextMenuEntry } from '../../../design-system';
import type { ConsoleEditor } from './consoleEditor';

type KindEntry = Extract<ContextMenuEntry, { label: string }>;

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

export const addPanelEntries = (editor: ConsoleEditor, area?: number): KindEntry[] =>
  ADDABLE_KINDS.map((kind): KindEntry => {
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
              editor.add(kind, choice, area);
            }}
          />
        ),
      };

    return { label: kindLabel(kind), disabled: !only, onSelect: () => only && editor.add(kind, only, area) };
  });

export const AddPanelMenu: React.FC<{ editor: ConsoleEditor; area: number; close: () => void }> = ({
  editor,
  area,
  close,
}) => {
  const [open, setOpen] = useState<string | null>(null);
  const entries = addPanelEntries(editor, area);
  const shown = entries.find((entry) => entry.label === open);

  if (shown && 'submenu' in shown)
    return (
      <div data-testid="add-panel-choices">
        <MenuBack label={shown.label} onBack={() => setOpen(null)} />
        <MenuDivider />
        {shown.submenu(close)}
      </div>
    );

  return entries.map((entry) =>
    'submenu' in entry ? (
      <MenuItem key={entry.label} label={entry.label} onSelect={() => setOpen(entry.label)} />
    ) : (
      <MenuItem
        key={entry.label}
        label={entry.label}
        disabled={entry.disabled}
        onSelect={() => {
          close();
          entry.onSelect();
        }}
      />
    ),
  );
};
