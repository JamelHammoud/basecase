import React from 'react';
import { Section, TextArea } from '../../design-system';
import type { Phase } from './types';

export const NotesSection: React.FC<{
  value: string;
  rows: number;
  onChange: (value: string, live?: Phase) => void;
}> = ({ value, rows, onChange }) => (
  <Section title="Notes" collapsible defaultOpen={value.trim() !== ''}>
    <TextArea
      rows={rows}
      aria-label="Notes"
      value={value}
      onChange={(e) => onChange(e.target.value, true)}
      onBlur={(e) => onChange(e.target.value, false)}
    />
  </Section>
);
