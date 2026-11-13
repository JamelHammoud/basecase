import React, { useState } from 'react';
import { TextInput } from '../../design-system';
import { SettingsRow as Row } from '../SettingsRows';

interface SecretFieldProps {
  label: string;
  saved: boolean;
  onSecret: (secret: string) => Promise<unknown>;
  savedHint?: React.ReactNode;
  error?: string | null;
}

export const SecretField: React.FC<SecretFieldProps> = ({ label, saved, onSecret, savedHint = 'Saved', error }) => {
  const [draft, setDraft] = useState('');
  const quiet = saved && !draft ? savedHint : undefined;

  return (
    <Row label={label} hint={error ? <span className="text-amber-200/80">{error}</span> : quiet}>
      <div className="w-[200px]">
        <TextInput
          type="password"
          value={draft}
          placeholder={saved ? '••••••••' : ''}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft)
              onSecret(draft).then(
                () => setDraft(''),
                () => {},
              );
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          aria-label={label}
        />
      </div>
    </Row>
  );
};
