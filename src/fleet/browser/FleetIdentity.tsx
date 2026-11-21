import { useState, type FormEvent } from 'react';
import { Button, ConfirmDialog, TextInput } from '../../design-system';
import { useAccessRequest } from './accessSession';
import type { AccessResource } from './accessTypes';
import { FleetGrants } from './FleetGrants';
import { FleetRules } from './FleetRules';
import { FleetInvitation } from './FleetInvitation';

export function FleetIdentity({
  org,
  kind,
  resource,
  onSaved,
}: {
  org: string;
  kind: string;
  resource: AccessResource;
  onSaved: () => void;
}) {
  const request = useAccessRequest();
  const [draft, setDraft] = useState(resource);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');

    try {
      await request(`${org}/${kind}${resource.id ? `/${resource.id}` : ''}`, {
        method: resource.id ? 'PUT' : 'POST',
        body: JSON.stringify(draft),
      });
      onSaved();
    } catch {
      setError('Check the fields and grants.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setDeleting(false);
    setBusy(true);

    try {
      await request(`${org}/${kind}/${resource.id}`, { method: 'DELETE' });
      onSaved();
    } catch {
      setError('Check the fields and grants.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4 rounded-xl bg-[#1f1f1f] p-6">
      <fieldset disabled={busy} className="space-y-4">
        <label className="block space-y-2">
          <span>Name</span>
          <TextInput
            required
            maxLength={200}
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        </label>
        {resource.id && <p className="break-all">{resource.id}</p>}
        {kind === 'role' ? (
          <FleetRules org={org} rules={draft.rules ?? []} onChange={(rules) => setDraft({ ...draft, rules })} />
        ) : (
          <FleetGrants
            org={org}
            kind="role"
            label="Roles"
            values={draft.roles ?? []}
            onChange={(roles) => setDraft({ ...draft, roles })}
          />
        )}
        {kind === 'group' && (
          <FleetGrants
            org={org}
            kind="account"
            label="Members"
            values={draft.members ?? []}
            onChange={(members) => setDraft({ ...draft, members })}
          />
        )}
        <div className="flex gap-3">
          <Button type="submit" variant="primary">
            Save
          </Button>
          {resource.id && (
            <Button type="button" variant="danger" onClick={() => setDeleting(true)}>
              Delete
            </Button>
          )}
        </div>
        {kind === 'account' && resource.id && <FleetInvitation org={org} account={resource.id} />}
      </fieldset>
      {error && <p role="alert">{error}</p>}
      <ConfirmDialog
        isOpen={deleting}
        title={`Delete ${resource.name}?`}
        onCancel={() => setDeleting(false)}
        onConfirm={() => void remove()}
      />
    </form>
  );
}
