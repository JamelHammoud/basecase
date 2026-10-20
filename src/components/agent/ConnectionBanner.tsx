import React, { useState } from 'react';
import type { AcpStatusInfo } from '../../types/robotics';
import { TextInput } from '../../design-system';

const BANNER = 'mx-[8px] px-3 py-2 rounded-xl bg-amber-500/10 text-[13px] text-amber-200/90 flex flex-col gap-2';
const ROW = 'flex items-center gap-2';
const BANNER_BUTTON =
  'h-7 px-2.5 rounded-lg text-[12.5px] font-medium text-amber-100 hover:bg-amber-500/15 cursor-default shrink-0 disabled:opacity-60';

const ApiKeyField: React.FC<{ onSave: (key: string) => Promise<void>; onCancel: () => void }> = ({
  onSave,
  onCancel,
}) => {
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!key.trim()) return;

    setSaving(true);

    try {
      await onSave(key.trim());
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={ROW}>
      <TextInput
        autoFocus
        type="password"
        value={key}
        placeholder="AIza…"
        aria-label="API key"
        onChange={(e) => setKey(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();

          if (e.key === 'Escape') onCancel();
        }}
        className="flex-1 min-w-0"
      />
      <button type="button" disabled={saving || !key.trim()} onClick={save} className={BANNER_BUTTON}>
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
};

const SignInBanner: React.FC<{
  acpStatus: AcpStatusInfo;
  onSignIn: (methodId: string) => Promise<void>;
  onSaveApiKey: (key: string) => Promise<void>;
}> = ({ acpStatus, onSignIn, onSaveApiKey }) => {
  const [waiting, setWaiting] = useState(false);
  const [enteringKey, setEnteringKey] = useState(false);
  const method = acpStatus.signIn?.methods[0];

  const signIn = async (id: string) => {
    setWaiting(true);

    try {
      await onSignIn(id);
    } finally {
      setWaiting(false);
    }
  };

  return (
    <div className={BANNER}>
      <div className={ROW}>
        <span className="flex-1 min-w-0 break-words">
          {waiting ? 'Finish signing in in your browser' : `Sign in to use ${acpStatus.agentName}`}
        </span>
        {method && (
          <button type="button" disabled={waiting} onClick={() => signIn(method.id)} className={BANNER_BUTTON}>
            {waiting ? 'Waiting…' : method.name}
          </button>
        )}
        {acpStatus.signIn?.apiKey && !enteringKey && (
          <button type="button" onClick={() => setEnteringKey(true)} className={BANNER_BUTTON}>
            Add API Key
          </button>
        )}
      </div>
      {acpStatus.error && <span className="text-[12.5px] text-amber-200/70 break-words">{acpStatus.error}</span>}
      {enteringKey && <ApiKeyField onSave={onSaveApiKey} onCancel={() => setEnteringKey(false)} />}
    </div>
  );
};

export const ConnectionBanner: React.FC<{
  acpStatus: AcpStatusInfo;
  onReconnect: (command?: string) => Promise<void>;
  onSignIn: (methodId: string) => Promise<void>;
  onSaveApiKey: (key: string) => Promise<void>;
}> = ({ acpStatus, onReconnect, onSignIn, onSaveApiKey }) => {
  if (acpStatus.connected && acpStatus.signIn) {
    return <SignInBanner acpStatus={acpStatus} onSignIn={onSignIn} onSaveApiKey={onSaveApiKey} />;
  }

  if (acpStatus.connected && !acpStatus.error) return null;

  return (
    <div className={BANNER}>
      <div className={ROW}>
        <span className="flex-1 min-w-0 break-words">
          {acpStatus.error ? `Agent error: ${acpStatus.error}` : 'Agent isn’t connected.'}
        </span>
        <button type="button" onClick={() => onReconnect(acpStatus.agentCommand)} className={BANNER_BUTTON}>
          Reconnect
        </button>
      </div>
    </div>
  );
};
