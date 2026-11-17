import { PageNavigation } from '../../design-system/PageNavigation';
import { useEffect, useState } from 'react';
import { Button } from '../../design-system';
import { useAccessRequest } from './accessSession';
import { FleetConnection, type Connection } from './FleetConnection';
import { useAccessPage } from './useAccessPage';

const EMPTY: Connection = { name: '', issuer: '', entryPoint: '', certificates: [], mappings: [], enabled: true };

export function FleetProviders({ org }: { org: string }) {
  const fleetRequest = useAccessRequest();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [after, setAfter] = useState('');
  const {
    page: roles,
    busy: loadingRoles,
    error: roleError,
  } = useAccessPage(`${org}/role?summary=1${after ? `&after=${after}` : ''}`);
  const [selected, setSelected] = useState<Connection>(EMPTY);
  const [version, setVersion] = useState(0);
  const [enforced, setEnforced] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    Promise.all([
      fleetRequest<{ items: Connection[] }>(`${org}/connections`),
      fleetRequest<{ enforced: boolean }>(`${org}/federation-policy`),
    ])
      .then(([providers, policy]) => {
        if (!active) return;

        setConnections(providers.items);
        setEnforced(policy.enforced);
      })
      .catch(() => {
        if (active) setError('Check your Fleet credentials.');
      });

    return () => {
      active = false;
    };
  }, [org, version, fleetRequest]);

  async function changePolicy() {
    setError('');

    try {
      await fleetRequest(`${org}/federation-policy`, { method: 'PUT', body: JSON.stringify({ enforced: !enforced }) });
      location.reload();
    } catch {
      setError('Set up local recovery before requiring SSO.');
    }
  }

  return (
    <section className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap gap-3">
        {connections.map((connection) => (
          <Button key={connection.id} onClick={() => setSelected(connection)}>
            {connection.name}
          </Button>
        ))}
        <Button
          onClick={() => {
            setSelected(EMPTY);
            setVersion((value) => value + 1);
          }}
        >
          Add Provider
        </Button>
        <Button onClick={() => void changePolicy()}>{enforced ? 'Allow Passwords' : 'Require SSO'}</Button>
      </div>
      {(error || roleError) && <p role="alert">{error || roleError}</p>}
      <PageNavigation after={after} next={roles.next} disabled={loadingRoles} onChange={setAfter} />
      <FleetConnection
        key={`${selected.id ?? 'new'}:${version}`}
        org={org}
        connection={selected}
        roles={roles.items}
        onSaved={() => {
          setSelected(EMPTY);
          setVersion((value) => value + 1);
        }}
      />
    </section>
  );
}
