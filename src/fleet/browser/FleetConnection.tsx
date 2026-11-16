import { useState, type FormEvent } from 'react';
import { Button, Switch, TextArea, TextInput } from '../../design-system';
import { fleetRequest } from './client';
import { FleetMappings, type AccessRole, type GroupMapping } from './FleetMappings';

export interface Connection {
  id?: string;
  name: string;
  issuer: string;
  entryPoint: string;
  certificates: string[];
  mappings: GroupMapping[];
  enabled: boolean;
}

export function FleetConnection({
  org,
  connection,
  roles,
  onSaved,
}: {
  org: string;
  connection: Connection;
  roles: AccessRole[];
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState(connection);
  const [certificates, setCertificates] = useState(connection.certificates.join('\n'));
  const [error, setError] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');

    try {
      const certs =
        certificates.match(
          /-----BEGIN (?:CERTIFICATE|PUBLIC KEY)-----[\s\S]+?-----END (?:CERTIFICATE|PUBLIC KEY)-----/g,
        ) ?? [];

      await fleetRequest(`${org}/connections${draft.id ? `/${draft.id}` : ''}`, {
        method: draft.id ? 'PUT' : 'POST',
        body: JSON.stringify({ ...draft, certificates: certs }),
      });
      onSaved();
    } catch {
      setError('Check the provider settings and role grants.');
    } finally {
      setBusy(false);
    }
  }

  async function rotateToken() {
    setError('');

    try {
      const result = await fleetRequest<{ token: string }>(`${org}/connections/${draft.id}/scim-token`, {
        method: 'POST',
        body: '{}',
      });

      setToken(result.token);
    } catch {
      setError('Check the provider settings and role grants.');
    }
  }

  return (
    <form onSubmit={save} className="space-y-4 rounded-xl bg-[#1f1f1f] p-6">
      <label className="block space-y-2">
        <span>Provider name</span>
        <TextInput required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
      </label>
      <label className="block space-y-2">
        <span>Issuer</span>
        <TextInput
          required
          readOnly={Boolean(draft.id)}
          value={draft.issuer}
          onChange={(event) => setDraft({ ...draft, issuer: event.target.value })}
        />
      </label>
      <label className="block space-y-2">
        <span>Sign-in URL</span>
        <TextInput
          required
          type="url"
          value={draft.entryPoint}
          onChange={(event) => setDraft({ ...draft, entryPoint: event.target.value })}
        />
      </label>
      <label className="block space-y-2">
        <span>Signing certificates</span>
        <TextArea required rows={5} value={certificates} onChange={(event) => setCertificates(event.target.value)} />
      </label>
      <FleetMappings
        mappings={draft.mappings}
        roles={roles}
        onChange={(mappings) => setDraft({ ...draft, mappings })}
      />
      <Switch label="Enabled" checked={draft.enabled} onChange={(enabled) => setDraft({ ...draft, enabled })} />
      {draft.id && (
        <dl className="space-y-2 break-all">
          <dt>Entity ID</dt>
          <dd>{`${location.origin}/v1/${org}/sso/${draft.id}`}</dd>
          <dt>Assertion consumer URL</dt>
          <dd>{`${location.origin}/v1/${org}/sso/${draft.id}/acs`}</dd>
          <dt>SCIM URL</dt>
          <dd>{`${location.origin}/scim/v2/${org}/${draft.id}`}</dd>
        </dl>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="flex gap-3">
        <Button type="submit" variant="primary" disabled={busy}>
          Save Provider
        </Button>
        {draft.id && (
          <Button type="button" disabled={!draft.enabled} onClick={() => void rotateToken()}>
            Rotate SCIM Token
          </Button>
        )}
      </div>
      {token && (
        <label className="block space-y-2">
          <span>SCIM token</span>
          <TextInput
            type="password"
            readOnly
            value={token}
            onFocus={(event) => event.target.select()}
            autoComplete="off"
          />
        </label>
      )}
    </form>
  );
}
