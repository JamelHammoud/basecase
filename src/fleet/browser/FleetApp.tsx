import { useEffect, useState } from 'react';
import { Button, ErrorBoundary } from '../../design-system';
import { fleetRequest } from './client';
import { FleetSignIn } from './FleetSignIn';
import { FleetInventory } from './FleetInventory';

export function FleetApp() {
  const [org, setOrg] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  function loadSession() {
    void fleetRequest<{ org: string }>('me')
      .then((session) => setOrg(session.org))
      .catch(() => setOrg(null))
      .finally(() => setReady(true));
  }

  useEffect(() => {
    loadSession();
  }, []);

  async function signOut() {
    await fleetRequest('sessions/current', { method: 'DELETE' });
    setOrg(null);
  }

  return (
    <main className="min-h-screen bg-[#121212] p-6 text-[14px] text-white/90">
      <header className="mx-auto mb-6 flex max-w-5xl items-center justify-between">
        <h1 className="text-[20px] font-semibold">Basecase Fleet</h1>
        {org && <Button onClick={() => void signOut()}>Sign Out</Button>}
      </header>
      {ready && (
        <ErrorBoundary region="Fleet">
          {org ? <FleetInventory key={org} org={org} /> : <FleetSignIn onSignedIn={loadSession} />}
        </ErrorBoundary>
      )}
    </main>
  );
}
