import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { NumberInput } from '../src/design-system/NumberInput';
import { FieldRow } from '../src/design-system/FieldRow';
import '../src/index.css';

const fields = [
  { label: 'Min', unit: 'mm', width: 88 },
  { label: 'Width', unit: 'mm', width: 160 },
  { label: 'Spool', unit: 'mm/rad', width: 272 },
  { label: 'Damping', unit: 'N s/mm', width: 272 },
  { label: 'Every', unit: 'frames', width: 272 },
  { label: 'Count', unit: '', width: 160 },
  { label: 'Spool coefficient', rowLabel: 'Spool', unit: 'mm/rad', width: 266 },
  { label: 'Damping coefficient', rowLabel: 'Damping', unit: 'N s/mm', width: 266 },
  { label: 'Frame interval', rowLabel: 'Every', unit: 'frames', width: 266 },
];

function Fixture() {
  const [values, setValues] = useState(fields.map(() => 12.5));

  return (
    <main style={{ width: 296, padding: 12 }}>
      {fields.map((field, index) => {
        const input = (
          <NumberInput
            label={field.rowLabel ? undefined : field.label}
            aria-label={field.label}
            title={field.label === 'Width' ? 'Width' : undefined}
            unit={field.unit}
            value={values[index]}
            precision={6}
            onChange={(value) => setValues((previous) => previous.map((old, i) => (i === index ? value : old)))}
          />
        );

        return (
          <div key={field.label} style={{ width: field.width }} data-field={field.label}>
            {field.rowLabel ? <FieldRow label={field.rowLabel}>{input}</FieldRow> : input}
          </div>
        );
      })}
      <NumberInput aria-label="Mixed" value={null} onChange={() => {}} />
      <NumberInput aria-label="Disabled" value={12.5} onChange={() => {}} disabled />
    </main>
  );
}

createRoot(document.getElementById('root')).render(<Fixture />);
