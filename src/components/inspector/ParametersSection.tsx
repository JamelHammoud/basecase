import { DimensionalRequirements } from './DimensionalRequirements';
import { useState } from 'react';
import { Button, FieldRow, Section, Select, TextInput, useScrollFade } from '../../design-system';
import { enteredParameter } from '../../utils/designParameters/targets';
import type { ParameterUnit } from '../../utils/designParameters/types';
import type { ScenePart } from '../../types/robotics';
import type { DesignParameters } from '../../workspace/useDesignParameters';
import { ParameterRow, PARAMETER_UNITS } from './ParameterRow';
import { ParameterBindings } from './ParameterBindings';

export function ParametersSection({ controls, part }: { controls: DesignParameters; part: ScenePart | null }) {
  const { ref: setFadeEl, style: fadeStyle } = useScrollFade();
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState<ParameterUnit>('mm');
  const add = async () => {
    if (await controls.apply({ op: 'set', parameter: enteredParameter(name.trim(), unit, value) })) {
      setName('');
      setValue('');
    }
  };

  return (
    <div ref={setFadeEl} style={fadeStyle} data-parameters className="max-h-[50%] shrink-0 overflow-y-auto">
      <Section title="Parameters" collapsible open={controls.expanded} onOpenChange={controls.setExpanded}>
        {controls.parameters.map((parameter) => (
          <ParameterRow
            key={`${parameter.name}:${parameter.expression ?? parameter.value}:${parameter.unit}:${JSON.stringify(parameter.tolerance)}`}
            parameter={parameter}
            controls={controls}
          />
        ))}
        <FieldRow label="Name">
          <TextInput aria-label="Name" value={name} onChange={(event) => setName(event.target.value)} />
        </FieldRow>
        <FieldRow label="Value">
          <TextInput aria-label="Value" value={value} onChange={(event) => setValue(event.target.value)} />
        </FieldRow>
        <FieldRow label="Unit">
          <Select
            aria-label="Unit"
            value={unit}
            options={PARAMETER_UNITS}
            onChange={(event) => setUnit(event.target.value as ParameterUnit)}
          />
        </FieldRow>
        <Button size="sm" disabled={controls.busy || !name.trim() || !value.trim()} onClick={() => void add()}>
          Add
        </Button>
        <DimensionalRequirements controls={controls} />
        {part && (
          <ParameterBindings
            key={`${part.id}:${JSON.stringify(part.dimensionBindings)}`}
            part={part}
            controls={controls}
          />
        )}
        {controls.busy && (
          <Button size="sm" onClick={controls.cancel}>
            Cancel
          </Button>
        )}
      </Section>
    </div>
  );
}
