import { useState } from 'react';
import { Button, ConfirmDialog, TextArea } from '../../design-system';

export function FleetCondition({
  label,
  values,
  onChange,
  onDelete,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  onDelete: () => void;
}) {
  const [pending, setPending] = useState<number | null>(null);

  function change(index: number, value: string) {
    onChange(values.map((entry, at) => (at === index ? value : entry)));
  }

  return (
    <fieldset className="space-y-2">
      <legend>{label}</legend>
      {values.map((value, index) => (
        <div key={index} className="flex gap-3">
          <TextArea
            aria-label={`${label} ${index + 1}`}
            rows={1}
            required
            maxLength={200}
            value={value}
            onChange={(event) => change(index, event.target.value)}
          />
          {values.length > 1 && (
            <Button type="button" variant="danger" onClick={() => setPending(index)}>
              Delete
            </Button>
          )}
        </div>
      ))}
      <div className="flex gap-3">
        <Button type="button" disabled={values.length >= 32} onClick={() => onChange([...values, ''])}>
          Add Value
        </Button>
        <Button type="button" variant="danger" onClick={onDelete}>
          Delete
        </Button>
      </div>
      <ConfirmDialog
        isOpen={pending !== null}
        title="Delete value?"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          onChange(values.filter((_value, index) => index !== pending));
          setPending(null);
        }}
      />
    </fieldset>
  );
}
