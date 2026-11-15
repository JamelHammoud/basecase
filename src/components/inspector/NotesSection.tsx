import React, { useId } from 'react';
import { Section, TextArea } from '../../design-system';

export const NotesSection: React.FC<{
  value: string;
  rows: number;
  onChange: (value: string, live: boolean) => void;
}> = ({ value, rows, onChange }) => {
  const titleId = useId();

  return (
    <Section title="Notes" titleId={titleId} collapsible defaultOpen={value.trim() !== ''}>
      <TextArea
        rows={rows}
        aria-labelledby={titleId}
        value={value}
        onChange={(e) => onChange(e.target.value, true)}
        onBlur={(e) => onChange(e.target.value, false)}
      />
    </Section>
  );
};
