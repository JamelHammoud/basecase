import { type FieldProps, seconds } from './fieldTypes';
import { NumberField } from './NumberField';

export function TimeLimit({ node, update }: Pick<FieldProps, 'node' | 'update'>) {
  return (
    <NumberField
      label={node.kind === 'base' ? 'For' : 'Time limit'}
      value={seconds(node.data.timeoutMs)}
      unit="s"
      min={0.1}
      max={3600}
      step={0.5}
      precision={1}
      onCommit={(s) => update({ timeoutMs: Math.round(s * 1000) })}
    />
  );
}
