import { useState } from 'react';
import { Button, TextInput } from '../../design-system';
import { useAccessRequest } from './accessSession';

export function FleetInvitation({ org, account }: { org: string; account: string }) {
  const request = useAccessRequest();
  const [email, setEmail] = useState('');
  const [invitation, setInvitation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function invite() {
    setBusy(true);
    setError('');
    setInvitation('');

    try {
      const result = await request<{ token?: string }>(`${org}/invitations`, {
        method: 'POST',
        body: JSON.stringify({ account, email }),
      });

      if (result.token) setInvitation(`${location.origin}/fleet/enroll#token=${result.token}`);
    } catch {
      setError('Check the fields and grants.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <label className="block space-y-2">
        <span>Email</span>
        <TextInput type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
      </label>
      <Button type="button" disabled={busy || !email} onClick={() => void invite()}>
        Invite
      </Button>
      {invitation && (
        <label className="block space-y-2">
          <span>Enrollment link</span>
          <TextInput readOnly autoComplete="off" value={invitation} onFocus={(event) => event.target.select()} />
        </label>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
