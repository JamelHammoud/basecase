import React from 'react';
import { TextInput } from '../../design-system';

export const GroupName: React.FC<{ name: string; onRename: (name: string) => void }> = ({ name, onRename }) => {
  const [draft, setDraft] = React.useState(name);
  const commit = () => {
    const next = draft.trim();

    if (next && next !== name) onRename(next);
    else setDraft(name);
  };

  return (
    <TextInput
      bare
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();

        if (e.key === 'Escape') {
          setDraft(name);
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
        }
      }}
      aria-label="Group name"
      className="font-semibold text-[14px]"
    />
  );
};
