import { useEffect, useState } from 'react';
import { Select } from '../../design-system';
import { AccessSession } from './accessSession';
import { accessScope } from './accessScope';
import { ACCESS_KINDS } from './accessTypes';
import { FleetCredentials } from './FleetCredentials';
import { FleetDirectory } from './FleetDirectory';
import { FleetProviders } from './FleetProviders';

export function FleetAccess({ org }: { org: string }) {
  const [kind, setKind] = useState('providers');
  const [denied, setDenied] = useState(false);
  const [scope] = useState(() => accessScope(() => setDenied(true)));

  useEffect(() => {
    const stream = new EventSource(`/v1/${org}/subscribe?access=1`);
    const deny = () => {
      stream.close();
      scope.close();
      setDenied(true);
    };

    scope.signal.addEventListener('abort', () => stream.close(), { once: true });
    stream.addEventListener('reset', deny);
    stream.onerror = deny;

    return () => {
      stream.close();
      scope.close();
    };
  }, [org, scope]);

  function onDenied() {
    scope.close();
    setDenied(true);
  }

  if (denied) return <p role="alert">Check your Fleet credentials.</p>;

  return (
    <AccessSession value={{ signal: scope.signal, onDenied }}>
      <section className="mx-auto max-w-3xl space-y-4">
        <Select
          aria-label="Resource"
          value={kind}
          options={ACCESS_KINDS}
          onChange={(event) => setKind(event.target.value)}
        />
        {kind === 'providers' && <FleetProviders org={org} />}
        {kind === 'credentials' && <FleetCredentials org={org} />}
        {!['providers', 'credentials'].includes(kind) && <FleetDirectory key={kind} org={org} kind={kind} />}
      </section>
    </AccessSession>
  );
}
