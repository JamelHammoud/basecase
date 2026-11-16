import { useEffect, useState } from 'react';
import { Button } from '../../design-system';
import { fleetRequest } from './client';
import { FleetConnection, type Connection } from './FleetConnection';
import type { AccessRole } from './FleetMappings';

const EMPTY: Connection = { name: '', issuer: '', entryPoint: '', certificates: [], mappings: [], enabled: true };

export function FleetAccess({ org }: { org: string }) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [roles, setRoles] = useState<AccessRole[]>([]);
  const [selected, setSelected] = useState<Connection>(EMPTY);
  const [version, setVersion] = useState(0);
  const [enforced, setEnforced] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    Promise.all([
      fleetRequest<{ items: Connection[] }>(`${org}/connections`),
      fleetRequest<{ items: AccessRole[] }>(`${org}/role`),
      fleetRequest<{ enforced: boolean }>(`${org}/federation-policy`),
    ])
      .then(([providers, grants, policy]) => {
        if (!active) return;

        setConnections(providers.items);
        setRoles(grants.items);
        setEnforced(policy.enforced);
      })
      .catch(() => {
        if (active) setError('Check your Fleet credentials.');
      });

    return () => {
      active = false;
    };
  }, [org, version]);

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
      <h2 className="text-[20px]">Access</h2>
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
      {error && <p role="alert">{error}</p>}
      <FleetConnection
        key={`${selected.id ?? 'new'}:${version}`}
        org={org}
        connection={selected}
        roles={roles}
        onSaved={() => {
          setSelected(EMPTY);
          setVersion((value) => value + 1);
        }}
      />
    </section>
  );
}
