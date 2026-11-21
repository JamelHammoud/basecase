import { PageNavigation } from '../../design-system/PageNavigation';
import { useState } from 'react';
import { Button } from '../../design-system';
import { useAccessPage } from './useAccessPage';
import { FleetResourceEditor } from './FleetResourceEditor';

export function FleetDirectory({ org, kind }: { org: string; kind: string }) {
  const [after, setAfter] = useState('');
  const [version, setVersion] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  const { page, busy, error } = useAccessPage(`${org}/${kind}?summary=1${after ? `&after=${after}` : ''}`, version);

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <Button disabled={busy} onClick={() => setSelected('')}>
          Add
        </Button>
        <PageNavigation
          after={after}
          next={page.next}
          disabled={busy}
          onChange={(cursor) => {
            setAfter(cursor);
            setSelected(null);
          }}
        />
      </div>
      <div className="space-y-2">
        {page.items.map((item) => (
          <Button key={item.id} className="w-full justify-start" onClick={() => setSelected(item.id)}>
            {item.name} ({item.id})
          </Button>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
      {selected !== null && (
        <FleetResourceEditor
          key={`${selected}:${version}`}
          org={org}
          kind={kind}
          id={selected}
          onSaved={() => {
            setSelected(null);
            setVersion((value) => value + 1);
          }}
        />
      )}
    </div>
  );
}
