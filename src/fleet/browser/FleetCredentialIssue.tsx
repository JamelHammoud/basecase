import { useState } from 'react';
import { Button, TextInput } from '../../design-system';
import { FleetRules } from './FleetRules';
import { useAccessRequest } from './accessSession';
import type { AccessRule } from './accessTypes';

export function FleetCredentialIssue({ org, onIssued }: { org: string; onIssued: () => void }) {
  const request = useAccessRequest();
  const [rules, setRules] = useState<AccessRule[]>([]);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function issue() {
    setBusy(true);
    setError('');
    setToken('');

    try {
      const result = await request<{ token?: string }>(`${org}/credentials`, {
        method: 'POST',
        body: JSON.stringify({ rules }),
      });

      if (result.token) setToken(result.token);

      onIssued();
    } catch {
      setError('Check the fields and grants.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <fieldset disabled={busy} className="space-y-4 rounded-xl bg-[#1f1f1f] p-6">
      <FleetRules org={org} rules={rules} onChange={setRules} />
      <Button disabled={busy || !rules.length} onClick={() => void issue()}>
        Issue Credential
      </Button>
      {token && (
        <label className="block space-y-2">
          <span>Service token</span>
          <TextInput
            type="password"
            autoComplete="off"
            readOnly
            value={token}
            onFocus={(event) => event.target.select()}
          />
        </label>
      )}
      {error && <p role="alert">{error}</p>}
    </fieldset>
  );
}
