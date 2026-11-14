import { ADD_PANEL } from './consoleEditor';
import React, { useState } from 'react';
import type { NewPanel } from '../../cases/console/layoutEdits';
import { kindName } from '../../cases/console/panelNames';
import {
  ADDABLE_KINDS,
  newPanel,
  panelChoices,
  picked,
  ready,
  type AddableKind,
  type SignalSources,
} from '../../cases/console/panelChoices';
import { ChoiceGrid, MenuItem, Modal, PlusIcon } from '../../design-system';

interface AddPanelSheetProps {
  sources: SignalSources;
  onAdd: (panel: NewPanel) => boolean;
  onClose: () => void;
}

const KIND_OPTIONS = ADDABLE_KINDS.map((k) => ({ value: k, label: kindName(k) }));

export const AddPanelSheet: React.FC<AddPanelSheetProps> = ({ sources, onAdd, onClose }) => {
  const [kind, setKind] = useState<AddableKind>('plot');
  const [choice, setChoice] = useState<string[]>([]);
  const choices = panelChoices(kind, sources);
  const canAdd = ready(choices, choice);

  const add = () => {
    if (canAdd && onAdd(newPanel(kind, choice))) onClose();
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={ADD_PANEL}
      icon={<PlusIcon />}
      maxWidth="max-w-md"
      action={{ label: ADD_PANEL, disabled: !canAdd, onClick: add }}
    >
      <ChoiceGrid
        label="Kind"
        columns={4}
        options={KIND_OPTIONS}
        value={kind}
        onChange={(k) => {
          setKind(k);
          setChoice([]);
        }}
      />
      {choices.options.length > 0 && (
        <div data-testid="panel-choices" role="menu" className="mt-[12px] [--pad-x:0px]">
          {choices.options.map((option) => (
            <MenuItem
              key={option}
              label={<span className="font-mono text-[12.5px]">{option}</span>}
              checked={choice.includes(option)}
              onSelect={() => setChoice(picked(choices, choice, option))}
            />
          ))}
        </div>
      )}
    </Modal>
  );
};
