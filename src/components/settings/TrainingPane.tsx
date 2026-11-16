import React, { useEffect, useState } from 'react';
import { Button, SegmentedControl, TextInput } from '../../design-system';
import { remoteTrainingBridge, type TrainingComputer, type TrainingComputerStatus } from '../../remoteTraining/bridge';
import { errorMessage } from '../../utils/errorMessage';
import { SettingsGroup as Group, SettingsRow as Row } from '../SettingsRows';

const EMPTY: TrainingComputer = { host: '', user: '', key: '', hostKey: '' };
const FIELDS: Array<{ field: keyof TrainingComputer; label: string; hint?: string }> = [
  { field: 'host', label: 'Host' },
  { field: 'user', label: 'User' },
  { field: 'key', label: 'SSH identity', hint: 'Enter the full path to an existing private key.' },
  { field: 'hostKey', label: 'Host key', hint: 'Compare this key with the computer’s host key before connecting.' },
];

export const TrainingPane: React.FC = () => {
  const [computer, setComputer] = useState<TrainingComputer>(EMPTY);
  const [status, setStatus] = useState<TrainingComputerStatus>({ selected: false });
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const accept = (next: TrainingComputerStatus) => {
    setStatus(next);
    setComputer({
      host: next.host ?? '',
      user: next.user ?? '',
      hostKey: next.hostKey ?? '',
      key: '',
      attempts: next.attempts ?? 1,
      concurrency: next.concurrency ?? 1,
    });
  };

  useEffect(() => {
    remoteTrainingBridge
      .status()
      .then(accept, (e: unknown) => setError(errorMessage(e)))
      .finally(() => setBusy(false));
  }, []);

  const save = async () => {
    setBusy(true);
    setError(null);

    try {
      accept(await remoteTrainingBridge.configure(computer));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const local = async () => {
    setBusy(true);
    setError(null);

    try {
      accept(await remoteTrainingBridge.clear());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Group>
      <Row label="Train on" hint={status.selected ? `${status.user}@${status.host}` : 'This computer'}>
        {status.selected && (
          <Button onClick={() => void local()} disabled={busy}>
            Use This Computer
          </Button>
        )}
      </Row>
      <Row label="Attempts" hint="Share the training budget across seeds.">
        <SegmentedControl
          aria-label="Attempts"
          value={String(computer.attempts ?? 1)}
          options={[1, 2, 3, 4].map((value) => ({ value: String(value), label: String(value) }))}
          onChange={(value) => setComputer({ ...computer, attempts: Number(value) })}
        />
      </Row>
      <Row label="Concurrent attempts">
        <SegmentedControl
          aria-label="Concurrent attempts"
          value={String(computer.concurrency ?? 1)}
          options={[1, 2].map((value) => ({ value: String(value), label: String(value) }))}
          onChange={(value) => setComputer({ ...computer, concurrency: Number(value) })}
        />
      </Row>
      {FIELDS.map(({ field, label, hint }) => (
        <Row key={field} label={label} hint={hint} stacked>
          <TextInput
            aria-label={label}
            type={field === 'key' ? 'password' : 'text'}
            value={computer[field]}
            placeholder={field === 'key' && status.keySaved ? '••••••••' : ''}
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
            onChange={(event) => setComputer({ ...computer, [field]: event.target.value })}
          />
        </Row>
      ))}
      <Row
        label=""
        hint={
          error ? (
            <span className="text-amber-400" role="alert">
              {error}
            </span>
          ) : undefined
        }
      >
        <Button
          variant="primary"
          onClick={() => void save()}
          disabled={
            busy || !computer.host || !computer.user || !computer.hostKey || (!computer.key && !status.keySaved)
          }
        >
          Connect
        </Button>
      </Row>
    </Group>
  );
};
