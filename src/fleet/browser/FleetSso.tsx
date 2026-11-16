import { useState } from 'react';
import { Button } from '../../design-system';
import { fleetRequest } from './client';

export function FleetSso({ org }: { org: string }) {
  const [providers, setProviders] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState('');

  async function discover() {
    setError('');

    try {
      const result = await fleetRequest<{ items: { id: string; name: string }[] }>(`${org}/sso`);

      setProviders(result.items);

      if (!result.items.length) setError('Check your organization ID.');
    } catch {
      setError('Check your organization ID.');
    }
  }

  return (
    <div className="space-y-3">
      <Button type="button" disabled={!org} onClick={() => void discover()}>
        Sign In with SSO
      </Button>
      {providers.map((provider) => (
        <Button key={provider.id} type="button" onClick={() => location.assign(`/v1/${org}/sso/${provider.id}/start`)}>
          {provider.name}
        </Button>
      ))}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
