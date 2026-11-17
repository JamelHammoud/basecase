import { PageNavigation } from '../../design-system/PageNavigation';
import { useState } from 'react';
import { Select, TextInput } from '../../design-system';
import { useAccessPage } from './useAccessPage';

const KINDS = [
  { value: 'site', label: 'Sites' },
  { value: 'region', label: 'Regions' },
  { value: 'robot', label: 'Robots' },
  { value: 'asset', label: 'Assets' },
];

export function FleetScope({
  org,
  value,
  onChange,
}: {
  org: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [kind, setKind] = useState('site');
  const [after, setAfter] = useState('');
  const { page, busy, error } = useAccessPage(`${org}/${kind}${after ? `?after=${after}` : ''}`);
  const options = [
    { value: '', label: 'Choose Scope' },
    { value: '*', label: 'Organization' },
    ...page.items.map((item) => ({ value: item.id, label: `${item.name} (${item.id})` })),
  ];

  return (
    <fieldset className="space-y-2">
      <legend>Scope</legend>
      <TextInput aria-label="Scope" required value={value} onChange={(event) => onChange(event.target.value)} />
      <Select
        aria-label="Scope kind"
        value={kind}
        options={KINDS}
        onChange={(event) => {
          setKind(event.target.value);
          setAfter('');
        }}
      />
      <Select
        aria-label="Scope resource"
        value=""
        options={options}
        disabled={busy}
        onChange={(event) => onChange(event.target.value)}
      />
      <PageNavigation after={after} next={page.next} disabled={busy} onChange={setAfter} />
      {error && <p role="alert">{error}</p>}
    </fieldset>
  );
}
