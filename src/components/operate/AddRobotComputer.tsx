import { useState, useSyncExternalStore } from 'react';
import { Modal, TextInput } from '../../design-system';
import { openRobotComputer, robotComputerSnapshot, subscribeRobotComputer } from '../../robot/robotComputer';
import type { RobotComputerAsk } from '../../robot/networkTypes';
import { errorMessage } from '../../utils/errorMessage';
import { OS } from '../../utils/os';

const KEY_EXAMPLES = {
  mac: '/Users/user/.ssh/id_ed25519',
  windows: 'C:\\Users\\user\\.ssh\\id_ed25519',
  linux: '/home/user/.ssh/id_ed25519',
};

const FIELDS = [
  { name: 'host', label: 'Host', placeholder: 'robot.local' },
  { name: 'user', label: 'User', placeholder: 'robot' },
  { name: 'key', label: 'SSH key', placeholder: KEY_EXAMPLES[OS] },
] as const;

export function AddRobotComputer() {
  const install = useSyncExternalStore(subscribeRobotComputer, robotComputerSnapshot, robotComputerSnapshot);
  const [fields, setFields] = useState<RobotComputerAsk>({ host: '', user: '', key: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const ready = fields.host.trim() && fields.user.trim();
  const close = () => {
    if (busy) return;

    openRobotComputer(null);
    setMessage(null);
    setFields({ host: '', user: '', key: '' });
  };
  const submit = async () => {
    if (!install || !ready || busy) return;

    setBusy(true);
    setMessage(null);

    try {
      const reply = await install(fields);

      const success = reply.ok && reply.pairingCode ? `Pairing code: ${reply.pairingCode}` : 'Connected';

      setMessage(reply.ok ? success : reply.message);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={!!install}
      onClose={close}
      title="Add a Robot Computer"
      maxWidth="max-w-[420px]"
      action={{ label: busy ? 'Installing…' : 'Install', disabled: !ready || busy, onClick: () => void submit() }}
    >
      <div className="flex flex-col gap-3">
        {FIELDS.map((field) => (
          <label key={field.name} className="flex flex-col gap-1.5 text-[13px] text-white/70">
            {field.label}
            <TextInput
              aria-label={field.label}
              value={fields[field.name]}
              placeholder={field.placeholder}
              disabled={busy}
              autoComplete="off"
              onChange={(event) => setFields({ ...fields, [field.name]: event.target.value })}
            />
          </label>
        ))}
        {message && (
          <p role="status" className="text-[13px] text-white/70">
            {message}
          </p>
        )}
      </div>
    </Modal>
  );
}
