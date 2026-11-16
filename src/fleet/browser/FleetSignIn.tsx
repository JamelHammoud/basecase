import { useEffect, useState, type FormEvent } from 'react';
import { Button, TextInput } from '../../design-system';
import { fleetRequest } from './client';

export function FleetSignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [org, setOrg] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token] = useState(() => new URLSearchParams(location.hash.slice(1)).get('token'));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    history.replaceState(null, '', location.pathname);
  }, []);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');

    try {
      await fleetRequest(token ? 'enroll' : 'sessions', {
        method: 'POST',
        body: JSON.stringify(token ? { token, password } : { org, email, password }),
      });
      onSignedIn();
    } catch {
      setError('Check your Fleet credentials.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={signIn} className="mx-auto max-w-md space-y-4 rounded-xl bg-[#1f1f1f] p-6">
      {!token && (
        <>
          <label className="block space-y-2">
            <span>Organization ID</span>
            <TextInput value={org} onChange={(event) => setOrg(event.target.value)} required />
          </label>
          <label className="block space-y-2">
            <span>Email</span>
            <TextInput
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
        </>
      )}
      <label className="block space-y-2">
        <span>Password</span>
        <TextInput
          type="password"
          autoComplete={token ? 'new-password' : 'current-password'}
          minLength={14}
          maxLength={1024}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <Button type="submit" variant="primary" disabled={busy}>
        {token ? 'Enroll' : 'Sign In'}
      </Button>
    </form>
  );
}
