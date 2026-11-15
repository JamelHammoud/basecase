import { useState } from 'react';
import { studyCatalogLabel } from '../../study/study';
import { Select, Switch } from '../../design-system';
import type { StudyKnob } from '../../study/types';
import { addCatalogChoice, catalogServoChoices } from './studyCatalogChoices';

type CatalogKnob = Extract<StudyKnob, { kind: 'servo' | 'battery' }>;

const SERVO_CHOICES = catalogServoChoices();
const ADD_SERVO = 'Add Servo';

export function StudyCatalogField({
  knob,
  disabled,
  onChange,
}: {
  knob: CatalogKnob;
  disabled: boolean;
  onChange: (knob: StudyKnob) => void;
}) {
  const [choices, setChoices] = useState(knob.values);
  const listed = [...new Set([...choices, ...knob.values])];
  const available = SERVO_CHOICES.filter((choice) => !listed.includes(choice.value));

  return (
    <div className="pl-3">
      {listed.map((value) => (
        <Switch
          key={value}
          label={studyCatalogLabel(value)}
          aria-label={studyCatalogLabel(value)}
          checked={knob.values.includes(value)}
          disabled={disabled || (knob.values.length === 1 && knob.values.includes(value))}
          onChange={(on) =>
            onChange({ ...knob, values: on ? [...knob.values, value] : knob.values.filter((v) => v !== value) })
          }
        />
      ))}
      {knob.kind === 'servo' && (
        <Select
          aria-label={ADD_SERVO}
          value=""
          disabled={disabled || available.length === 0}
          options={[{ value: '', label: ADD_SERVO }, ...available]}
          onChange={(event) => {
            const value = event.target.value;

            if (!value) return;

            setChoices((current) => addCatalogChoice(current, value));
            onChange({ ...knob, values: addCatalogChoice(knob.values, value) });
          }}
        />
      )}
    </div>
  );
}
