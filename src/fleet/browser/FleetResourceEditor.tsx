import { useEffect, useState } from 'react';
import { useAccessRequest } from './accessSession';
import type { AccessResource } from './accessTypes';
import { FleetIdentity } from './FleetIdentity';

const EMPTY = { id: '', name: '', attributes: {}, rules: [], roles: [], members: [] };

export function FleetResourceEditor({
  org,
  kind,
  id,
  onSaved,
}: {
  org: string;
  kind: string;
  id: string;
  onSaved: () => void;
}) {
  const request = useAccessRequest();
  const [resource, setResource] = useState<AccessResource | null>(id ? null : EMPTY);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;

    let active = true;

    void request<AccessResource>(`${org}/${kind}/${id}`)
      .then((value) => {
        if (active) setResource(value);
      })
      .catch(() => {
        if (active) setError('Check your Fleet credentials.');
      });

    return () => {
      active = false;
    };
  }, [org, kind, id, request]);

  if (error) return <p role="alert">{error}</p>;

  return resource ? <FleetIdentity org={org} kind={kind} resource={resource} onSaved={onSaved} /> : null;
}
