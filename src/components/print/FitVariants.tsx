import { useState } from 'react';
import { Button, FieldRow, Section, Select, TextInput } from '../../design-system';
import type { Printing } from '../../workspace/usePrinting';
import type { ScenePart, ProjectSettings } from '../../types/robotics';
import { printMaterialOf } from '../../utils/bom';

export function FitVariants({
  printing,
  parts,
  project,
}: {
  printing: Printing;
  parts: ScenePart[];
  project: ProjectSettings;
}) {
  const [dimension, setDimension] = useState('');
  const [mate, setMate] = useState('');
  const [values, setValues] = useState('');
  const variants = printing.fitTest?.variants;

  if (!variants) return null;

  const binding = variants.bindings.find((b) => b.id === dimension);
  const host = parts.find((p) => p.id === binding?.host);
  const selected = variants.comparison?.candidates.findIndex((c) => c.id === printing.mode?.selected) ?? -1;
  const candidate = variants.comparison?.candidates[selected];

  return (
    <Section title="Variants">
      <FieldRow label="Dimension">
        <Select
          aria-label="Dimension"
          value={dimension}
          options={[
            { value: '', label: 'Choose Dimension' },
            ...variants.bindings.map((b) => ({ value: b.id, label: b.label })),
          ]}
          onChange={(event) => setDimension(event.target.value)}
        />
      </FieldRow>
      <FieldRow label="Mating part">
        <Select
          aria-label="Mating part"
          value={mate}
          options={[
            { value: '', label: 'Choose Mating Part' },
            ...parts
              .filter((p) => p.id !== binding?.host && p.role === 'solid')
              .map((p) => ({ value: p.id, label: p.name })),
          ]}
          onChange={(event) => setMate(event.target.value)}
        />
      </FieldRow>
      <FieldRow label="Values (mm)">
        <TextInput
          aria-label="Values (mm)"
          value={values}
          maxLength={160}
          placeholder="21.9, 22, 22.1"
          onChange={(event) => setValues(event.target.value)}
        />
      </FieldRow>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={!binding || !mate || !values || variants.busy}
          onClick={() =>
            binding &&
            host &&
            void variants.prepare({
              binding,
              material: printMaterialOf(host, project),
              fit: mate,
              values: values.split(',').map((v) => Number(v.trim())),
              down: host.print?.down ?? printing.fitTest?.downs[host.id] ?? [0, -1, 0],
            })
          }
        >
          Prepare Variants
        </Button>
        {variants.busy && (
          <Button size="sm" variant="ghost" onClick={variants.cancel}>
            Cancel
          </Button>
        )}
      </div>
      {variants.comparison?.candidates.map((c) =>
        c.reason ? (
          <div key={c.id} className="text-[13px] text-red-400">
            {c.value} mm: {c.reason}
          </div>
        ) : (
          <Button
            key={c.id}
            size="sm"
            variant={printing.mode?.selected === c.id ? 'primary' : 'ghost'}
            onClick={() => printing.selectPart(c.id)}
          >
            {c.value} mm
          </Button>
        ),
      )}
      {candidate?.coupon && (
        <Button
          size="sm"
          disabled={variants.stale || variants.busy}
          title={variants.stale ? 'The design changed. Prepare the fit variants again.' : undefined}
          onClick={() => void variants.apply(selected).then((ok) => ok && printing.closeMode())}
        >
          Apply {candidate.value} mm
        </Button>
      )}
    </Section>
  );
}
