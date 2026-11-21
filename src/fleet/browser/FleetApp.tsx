import { useEffect, useState } from 'react';
import { Button, ErrorBoundary } from '../../design-system';
import { fleetRequest } from './client';
import { FleetSignIn } from './FleetSignIn';
import { FleetAccess } from './FleetAccess';
import { FleetInventory } from './FleetInventory';

export function FleetApp() {
  const [enrolling] = useState(() => Boolean(new URLSearchParams(location.hash.slice(1)).get('token')));
  const [managesAccess, setManagesAccess] = useState(false);
  const [access, setAccess] = useState(false);
  const [credential, setCredential] = useState('');
  const [org, setOrg] = useState<string | null>(null);
  const [ready, setReady] = useState(enrolling);

  function loadSession() {
    void fleetRequest<{ org: string; canManage: boolean; credential: string }>('me')
      .then((session) => {
        setOrg(session.org);
        setCredential(session.credential);
        setManagesAccess(session.canManage);
      })
      .catch(() => setOrg(null))
      .finally(() => setReady(true));
  }

  useEffect(() => {
    if (!enrolling) loadSession();
  }, [enrolling]);

  async function signOut() {
    await fleetRequest('sessions/current', { method: 'DELETE' });
    setOrg(null);
    setAccess(false);
  }

  return (
    <main className="h-full overflow-auto bg-[#121212] p-6 text-[14px] text-white/90">
      <header className="mx-auto mb-6 flex max-w-5xl items-center justify-between">
        <h1 className="text-[20px] font-semibold">Basecase Fleet</h1>
        {org && (
          <div className="flex gap-3">
            {managesAccess && <Button onClick={() => setAccess(!access)}>{access ? 'Inventory' : 'Access'}</Button>}
            <Button onClick={() => void signOut()}>Sign Out</Button>
          </div>
        )}
      </header>
      {ready && (
        <ErrorBoundary region="Fleet">
          {org && access ? <FleetAccess key={`${org}:${credential}`} org={org} /> : null}
          {org && !access ? <FleetInventory key={org} org={org} /> : null}
          {!org && <FleetSignIn onSignedIn={loadSession} />}
        </ErrorBoundary>
      )}
    </main>
  );
}
