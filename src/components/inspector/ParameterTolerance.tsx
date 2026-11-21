import { useState } from 'react';
import { TextInput, FieldRow } from '../../design-system';
import type { DesignParameter } from '../../utils/designParameters/types';
import type { DesignParameters } from '../../workspace/useDesignParameters';

export function ParameterTolerance({
  parameter,
  controls,
}: {
  parameter: DesignParameter;
  controls: DesignParameters;
}) {
  const [lower, setLower] = useState(parameter.tolerance?.lower.toString() ?? '');
  const [upper, setUpper] = useState(parameter.tolerance?.upper.toString() ?? '');
  const save = () => {
    if (!!lower.trim() !== !!upper.trim()) return;

    const tolerance = lower.trim() ? { lower: Number(lower), upper: Number(upper) } : undefined;

    if (JSON.stringify(tolerance) === JSON.stringify(parameter.tolerance)) return;

    void controls.apply({ op: 'set', parameter: { ...parameter, tolerance } });
  };

  return (
    <div
      className="col-span-full pb-2"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) save();
      }}
    >
      <FieldRow label="Lower deviation">
        <TextInput
          aria-label={`Lower deviation for ${parameter.name}`}
          value={lower}
          disabled={controls.busy}
          onChange={(event) => setLower(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
      </FieldRow>
      <FieldRow label="Upper deviation">
        <TextInput
          aria-label={`Upper deviation for ${parameter.name}`}
          value={upper}
          disabled={controls.busy}
          onChange={(event) => setUpper(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
      </FieldRow>
    </div>
  );
}
