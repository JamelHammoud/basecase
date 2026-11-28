import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { NumberInput } from '../src/design-system/NumberInput';
import '../src/index.css';

const fields = [
  { label: 'Min', unit: 'mm', width: 88 },
  { label: 'Width', unit: 'mm', width: 160 },
  { label: 'Spool', unit: 'mm/rad', width: 272 },
  { label: 'Damping', unit: 'N s/mm', width: 272 },
  { label: 'Every', unit: 'frames', width: 272 },
  { label: 'Count', unit: '', width: 160 },
];

function Fixture() {
  const [values, setValues] = useState(fields.map(() => 12.5));

  return (
    <main style={{ width: 296, padding: 12 }}>
      {fields.map((field, index) => (
        <div key={field.label} style={{ width: field.width }} data-field={field.label}>
          <NumberInput
            label={field.label}
            unit={field.unit}
            value={values[index]}
            precision={6}
            onChange={(value) => setValues((previous) => previous.map((old, i) => (i === index ? value : old)))}
          />
        </div>
      ))}
      <NumberInput aria-label="Mixed" value={null} onChange={() => {}} />
      <NumberInput aria-label="Disabled" value={12.5} onChange={() => {}} disabled />
    </main>
  );
}

createRoot(document.getElementById('root')).render(<Fixture />);
