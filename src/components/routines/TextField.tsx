import { useState } from 'react';
import { TextInput } from '../../design-system';
import { FieldRow } from './FieldRow';

export function TextField({
  label,
  value,
  placeholder,
  onCommit,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    const text = draft?.trim();

    setDraft(null);

    if (text && text !== value) onCommit(text);
  };

  return (
    <FieldRow label={label}>
      <TextInput
        value={draft ?? value}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
      />
    </FieldRow>
  );
}
