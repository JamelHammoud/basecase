import { useState } from 'react';
import { Modal, TextInput } from '../../design-system';
import { openRobotComputer, type InstallComputer } from '../../robot/robotComputer';
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
  { name: 'user', label: 'User', placeholder: '' },
  { name: 'key', label: 'SSH key', placeholder: KEY_EXAMPLES[OS] },
] as const;

export function RobotComputerForm({ install }: { install: InstallComputer }) {
  const [fields, setFields] = useState<RobotComputerAsk>({ host: '', user: '', key: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const ready = fields.host.trim() && fields.user.trim();
  const close = () => {
    if (!busy) openRobotComputer(null);
  };
  const submit = async () => {
    if (!ready || busy) return;

    setBusy(true);
    setMessage(null);

    try {
      const reply = await install(fields);
      const success = reply.ok && reply.pairingCode ? `Pairing code: ${reply.pairingCode}` : 'Connected';

      setMessage({ text: reply.ok ? success : reply.message, error: !reply.ok });
    } catch (error) {
      setMessage({ text: errorMessage(error), error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={close}
      title="Add a Robot Computer"
      maxWidth="max-w-[420px]"
      action={{ label: busy ? 'Installing…' : 'Install', disabled: !ready || busy, onClick: () => void submit() }}
    >
      <div className="flex flex-col gap-3">
        {FIELDS.map((field) => (
          <label key={field.name} className="flex flex-col gap-1.5 text-[13px] text-white/50">
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
          <p role="status" className={`text-[13px] ${message.error ? 'text-red-400' : 'text-white/60'}`}>
            {message.text}
          </p>
        )}
      </div>
    </Modal>
  );
}
