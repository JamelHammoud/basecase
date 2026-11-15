import { useState } from 'react';
import { Switch, TextInput } from '../../design-system';
import type { StudyKnob } from '../../study/types';
import { StudyCatalogField } from './StudyCatalogField';
import { editKnobValues, knobValuesText } from './studyView';

interface StudyKnobFieldProps {
  knob: StudyKnob;
  enabled: boolean;
  disabled: boolean;
  onEnabled: (enabled: boolean) => void;
  onChange: (knob: StudyKnob) => void;
  onProblem: (problem: boolean) => void;
}

export function StudyKnobField({ knob, enabled, disabled, onEnabled, onChange, onProblem }: StudyKnobFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? knobValuesText(knob);
  const problem = !editKnobValues(knob, value);
  const label = knob.label ?? knob.id;

  return (
    <div className="flex flex-col gap-1.5" data-testid="study-knob" data-knob={knob.id}>
      <Switch
        label={label}
        aria-label={label}
        checked={enabled}
        disabled={disabled}
        onChange={(on) => {
          onEnabled(on);
          onProblem(on && problem);
        }}
      />
      {enabled && (knob.kind === 'servo' || knob.kind === 'battery') && (
        <StudyCatalogField knob={knob} disabled={disabled} onChange={onChange} />
      )}
      {enabled && knob.kind !== 'servo' && knob.kind !== 'battery' && (
        <TextInput
          aria-label={`${label} values`}
          aria-invalid={problem}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            const next = e.target.value;
            const edited = editKnobValues(knob, next);

            setDraft(next);
            onProblem(!edited);

            if (edited) onChange(edited);
          }}
          onBlur={() => !problem && setDraft(null)}
        />
      )}
    </div>
  );
}
