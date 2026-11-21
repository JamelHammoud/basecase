import { PageNavigation } from '../../design-system/PageNavigation';
import { useState } from 'react';
import { Button, ConfirmDialog, Select } from '../../design-system';
import { useAccessPage } from './useAccessPage';

export function FleetGrants({
  org,
  kind,
  label,
  values,
  onChange,
}: {
  org: string;
  kind: 'account' | 'role';
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const [after, setAfter] = useState('');
  const [pending, setPending] = useState<string | null>(null);

  const { page, busy, error } = useAccessPage(`${org}/${kind}?summary=1${after ? `&after=${after}` : ''}`);

  const options = [
    { value: '', label: 'Add Grant' },
    ...page.items
      .filter((item) => !values.includes(item.id))
      .map((item) => ({ value: item.id, label: `${item.name} (${item.id})` })),
  ];

  return (
    <fieldset className="space-y-2">
      <legend>{label}</legend>
      {values.map((id) => (
        <div key={id} className="flex items-center gap-3">
          <span className="min-w-0 flex-1 break-all">
            {page.items.find((item) => item.id === id)?.name} ({id})
          </span>
          <Button type="button" variant="danger" onClick={() => setPending(id)}>
            Delete
          </Button>
        </div>
      ))}
      <Select
        aria-label={label}
        disabled={busy || values.length >= 100}
        value=""
        options={options}
        onChange={(event) => onChange([...values, event.target.value])}
      />
      <PageNavigation after={after} next={page.next} disabled={busy} onChange={setAfter} />
      {error && <p role="alert">{error}</p>}
      <ConfirmDialog
        isOpen={pending !== null}
        title="Delete grant?"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          onChange(values.filter((id) => id !== pending));
          setPending(null);
        }}
      />
    </fieldset>
  );
}
