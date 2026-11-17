import { PageNavigation } from '../../design-system/PageNavigation';
import { useState } from 'react';
import { Button, ConfirmDialog } from '../../design-system';
import { dayLabel } from '../../utils/timeAgo';
import { useAccessRequest } from './accessSession';
import { useAccessPage } from './useAccessPage';
import { FleetCredentialIssue } from './FleetCredentialIssue';

interface Credential {
  id: string;
  account: string;
  kind: string;
  expires: string;
}

export function FleetCredentials({ org }: { org: string }) {
  const request = useAccessRequest();
  const [after, setAfter] = useState('');
  const [version, setVersion] = useState(0);
  const [pending, setPending] = useState<Credential | null>(null);

  const { page, busy, error } = useAccessPage<Credential>(
    `${org}/credentials${after ? `?after=${after}` : ''}`,
    version,
  );

  const [revoking, setRevoking] = useState(false);
  const [failure, setFailure] = useState('');

  async function revoke() {
    if (!pending || busy || revoking) return;

    setRevoking(true);
    setPending(null);

    try {
      await request(`${org}/credentials/${pending.id}`, { method: 'DELETE' });
      setVersion((value) => value + 1);
      setRevoking(false);
    } catch {
      setFailure('Check your Fleet credentials.');
      setRevoking(false);
    }
  }

  return (
    <div className="space-y-4">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr>
            <th>Credential</th>
            <th>Account</th>
            <th>Kind</th>
            <th>Expires</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {page.items.map((item) => (
            <tr key={item.id}>
              <td className="break-all p-3">{item.id}</td>
              <td className="break-all p-3">{item.account}</td>
              <td className="p-3">{item.kind}</td>
              <td className="p-3">{dayLabel(item.expires)}</td>
              <td>
                <Button variant="danger" disabled={busy || revoking} onClick={() => setPending(item)}>
                  Revoke
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <PageNavigation after={after} next={page.next} disabled={busy || revoking} onChange={setAfter} />
      {(error || failure) && <p role="alert">{error || failure}</p>}
      <FleetCredentialIssue org={org} onIssued={() => setVersion((value) => value + 1)} />
      <ConfirmDialog
        isOpen={pending !== null}
        title={`Delete ${pending?.id ?? ''}?`}
        onCancel={() => setPending(null)}
        onConfirm={() => void revoke()}
      />
    </div>
  );
}
