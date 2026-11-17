import { useState } from 'react';
import { Button, ConfirmDialog, Select, TextInput } from '../../design-system';
import type { AccessRule } from './accessTypes';
import { FleetCondition } from './FleetCondition';

type Conditions = NonNullable<AccessRule['conditions']>;

export function FleetConditions({ value, onChange }: { value: Conditions; onChange: (value: Conditions) => void }) {
  const [target, setTarget] = useState<'robot' | 'site'>('robot');
  const [attribute, setAttribute] = useState('');
  const [pending, setPending] = useState<{ target: 'robot' | 'site'; key: string } | null>(null);

  function change(kind: 'robot' | 'site', key: string, values: string[]) {
    onChange({ ...value, [kind]: { ...value[kind], [key]: values } });
  }

  return (
    <fieldset className="space-y-3">
      <legend>Conditions</legend>
      {(['robot', 'site'] as const).flatMap((kind) =>
        Object.entries(value[kind] ?? {}).map(([key, values]) => (
          <FleetCondition
            key={`${kind}:${key}`}
            label={`${kind}: ${key}`}
            values={values}
            onChange={(next) => change(kind, key, next)}
            onDelete={() => setPending({ target: kind, key })}
          />
        )),
      )}
      <div className="flex gap-3">
        <Select
          aria-label="Condition resource"
          value={target}
          options={[
            { value: 'robot', label: 'Robot' },
            { value: 'site', label: 'Site' },
          ]}
          onChange={(event) => setTarget(event.target.value as 'robot' | 'site')}
        />
        <TextInput
          aria-label="Attribute"
          maxLength={32}
          value={attribute}
          onChange={(event) => setAttribute(event.target.value)}
        />
        <Button
          type="button"
          disabled={
            !attribute || Object.hasOwn(value[target] ?? {}, attribute) || Object.keys(value[target] ?? {}).length >= 16
          }
          onClick={() => {
            change(target, attribute, ['']);
            setAttribute('');
          }}
        >
          Add Condition
        </Button>
      </div>
      <ConfirmDialog
        isOpen={pending !== null}
        title="Delete condition?"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (!pending) return;

          const entries = { ...value[pending.target] };

          delete entries[pending.key];
          onChange({ ...value, [pending.target]: entries });
          setPending(null);
        }}
      />
    </fieldset>
  );
}
