import { useState } from 'react';
import { Button, FieldRow, Select, TextInput } from '../../design-system';
import { parameterTargets } from '../../utils/designParameters/targets';
import type { ParameterUnit } from '../../utils/designParameters/types';
import type { ScenePart } from '../../types/robotics';
import type { DesignParameters } from '../../workspace/useDesignParameters';
import { PARAMETER_UNITS } from './ParameterRow';

export function ParameterBindings({ part, controls }: { part: ScenePart; controls: DesignParameters }) {
  const targets = parameterTargets(part);
  const [selected, setSelected] = useState(targets[0]?.value ?? '');
  const target = targets.find((item) => item.value === selected) ?? targets[0];
  const binding = part.dimensionBindings?.find((item) => item.kind === target?.kind && item.target === target.target);
  const [draft, setDraft] = useState<string | null>(null);
  const [unit, setUnit] = useState<ParameterUnit | null>(null);

  if (!target) return null;

  const expression = draft ?? binding?.expression ?? '';
  const dimensionUnit = unit ?? binding?.unit ?? target.unit;

  return (
    <div data-dimension-bindings className="space-y-2.5">
      <FieldRow label="Dimension">
        <Select
          aria-label="Dimension"
          value={target.value}
          options={targets}
          onChange={(event) => {
            setSelected(event.target.value);
            setDraft(null);
            setUnit(null);
          }}
        />
      </FieldRow>
      <FieldRow label="Expression">
        <TextInput aria-label="Expression" value={expression} onChange={(event) => setDraft(event.target.value)} />
      </FieldRow>
      {target.kind === 'cad' && (
        <FieldRow label="Unit">
          <Select
            aria-label="Dimension unit"
            value={dimensionUnit}
            options={PARAMETER_UNITS}
            onChange={(event) => setUnit(event.target.value as ParameterUnit)}
          />
        </FieldRow>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={controls.busy || !expression}
          onClick={() =>
            void controls.apply({
              op: 'bind',
              part: part.id,
              binding: {
                kind: target.kind,
                target: target.target,
                unit: dimensionUnit,
                expression,
              },
            })
          }
        >
          Bind
        </Button>
        {binding && (
          <Button
            size="sm"
            disabled={controls.busy}
            onClick={() =>
              void controls.apply({ op: 'unbind', part: part.id, kind: target.kind, target: target.target })
            }
          >
            Unbind
          </Button>
        )}
      </div>
    </div>
  );
}
