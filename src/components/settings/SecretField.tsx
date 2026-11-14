import React, { useEffect, useRef, useState } from 'react';
import { TextInput } from '../../design-system';
import { SettingsRow as Row } from '../SettingsRows';

interface SecretFieldProps {
  label: string;
  saved: boolean;
  onSecret: (secret: string) => Promise<unknown>;
  savedHint?: React.ReactNode;
  error?: string | null;
  focusAsk?: number;
}

export const SecretField: React.FC<SecretFieldProps> = ({ label, saved, onSecret, savedHint, error, focusAsk }) => {
  const [draft, setDraft] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const quiet = saved && !draft ? savedHint : undefined;

  useEffect(() => {
    if (focusAsk) input.current?.focus();
  }, [focusAsk]);

  return (
    <Row label={label} hint={error ? <span className="text-amber-200/80">{error}</span> : quiet}>
      <div className="w-[200px]">
        <TextInput
          ref={input}
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
