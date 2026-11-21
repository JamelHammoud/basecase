import { ParameterTolerance } from './ParameterTolerance';
import { TextInput, Select, IconButton, DeleteIcon } from '../../design-system';
import { enteredParameter } from '../../utils/designParameters/targets';
import type { DesignParameter, ParameterUnit } from '../../utils/designParameters/types';
import type { DesignParameters } from '../../workspace/useDesignParameters';

export const PARAMETER_UNITS = [
  { value: 'mm', label: 'mm' },
  { value: 'deg', label: 'deg' },
  { value: '1', label: '1' },
];

export function ParameterRow({ parameter, controls }: { parameter: DesignParameter; controls: DesignParameters }) {
  const text = parameter.expression ?? String(parameter.value);

  return (
    <div className="grid grid-cols-[1fr_1fr_64px_28px] gap-1.5 items-center">
      <TextInput
        aria-label={`Rename ${parameter.name}`}
        defaultValue={parameter.name}
        disabled={controls.busy}
        onBlur={async (event) => {
          const input = event.currentTarget;
          const to = input.value.trim();

          if (to === parameter.name) return;

          const ok = await controls.apply({ op: 'rename', name: parameter.name, to });

          if (!ok) input.value = parameter.name;
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
      <TextInput
        aria-label={parameter.name}
        defaultValue={text}
        disabled={controls.busy}
        onBlur={async (event) => {
          const input = event.currentTarget;

          if (input.value === text) return;

          const ok = await controls.apply({
            op: 'set',
            parameter: {
              ...enteredParameter(parameter.name, parameter.unit, input.value),
              tolerance: parameter.tolerance,
            },
          });

          if (!ok) input.value = text;
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
      <Select
        aria-label={`Unit for ${parameter.name}`}
        value={parameter.unit}
        options={PARAMETER_UNITS}
        disabled={controls.busy}
        onChange={(event) =>
          void controls.apply({
            op: 'set',
            parameter: {
              ...enteredParameter(parameter.name, event.target.value as ParameterUnit, text),
              tolerance: parameter.tolerance,
            },
          })
        }
      />
      <IconButton
        title={`Delete ${parameter.name}`}
        icon={<DeleteIcon />}
        size="xs"
        variant="danger"
        disabled={controls.busy}
        onClick={() => controls.remove(parameter.name)}
      />
      {parameter.unit === 'mm' && parameter.expression === undefined && (
        <ParameterTolerance parameter={parameter} controls={controls} />
      )}
    </div>
  );
}
