import React, { useState } from 'react';
import type { AcpStatusInfo } from '../../types/robotics';
import { Button, TextInput } from '../../design-system';

const BANNER = 'mx-[8px] px-3 py-2 rounded-xl bg-amber-500/10 text-[13px] text-amber-200/90 flex flex-col gap-2';
const ROW = 'flex items-center gap-2';

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
      <Button size="xs" disabled={saving || !key.trim()} onClick={save} className="shrink-0">
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </div>
  );
};

const DownloadBanner: React.FC<{ download: NonNullable<AcpStatusInfo['download']> }> = ({ download }) => (
  <div className="mx-[8px] px-3 py-2.5 rounded-xl bg-white/[0.04] text-[13px] text-white/70 flex flex-col gap-2">
    <div className={ROW}>
      <span className="flex-1 min-w-0 truncate">Downloading {download.name}…</span>
      <span className="text-[12.5px] text-white/50 tabular-nums">{download.percent}%</span>
    </div>
    <div className="h-[3px] rounded-full bg-white/[0.08] overflow-hidden">
      <div className="h-full rounded-full bg-white/60" style={{ width: `${download.percent}%` }} />
    </div>
  </div>
);

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
          <Button size="xs" disabled={waiting} onClick={() => signIn(method.id)} className="shrink-0">
            {method.name}
          </Button>
        )}
        {acpStatus.signIn?.apiKey && !enteringKey && (
          <Button size="xs" onClick={() => setEnteringKey(true)} className="shrink-0">
            Add API Key
          </Button>
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
  if (acpStatus.download) return <DownloadBanner download={acpStatus.download} />;

  if (acpStatus.connected && acpStatus.signIn) {
    return <SignInBanner acpStatus={acpStatus} onSignIn={onSignIn} onSaveApiKey={onSaveApiKey} />;
  }

  if (acpStatus.connecting || (acpStatus.connected && !acpStatus.error)) return null;

  return (
    <div className={BANNER}>
      <div className={ROW}>
        <span className="flex-1 min-w-0 break-words">
          {acpStatus.error ? `Agent isn’t connected. ${acpStatus.error}` : 'Agent isn’t connected.'}
        </span>
        <Button size="xs" onClick={() => onReconnect(acpStatus.agentCommand)} className="shrink-0">
          Reconnect
        </Button>
      </div>
    </div>
  );
};
