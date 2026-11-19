import { useState } from 'react';
import { Button, Switch, DeleteIcon, FieldRow, IconButton, Section, TextInput } from '../../design-system';
import { confirmAction } from '../../design-system/confirmStore';
import { surfaceOperands } from '../../booleans/operands';
import type { DesignParameters } from '../../workspace/useDesignParameters';
import type { DimensionalRequirement } from '../../utils/designParameters/types';

const EMPTY = { name: '', expression: '', minimum: 0, maximum: 1, dimensions: [] } satisfies DimensionalRequirement;

export function DimensionalRequirements({ controls }: { controls: DesignParameters }) {
  const [draft, setDraft] = useState<DimensionalRequirement>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const choices = surfaceOperands(controls.parts).flatMap((part) =>
    (part.dimensionBindings ?? []).flatMap((binding) => {
      if (binding.unit !== 'mm' || !controls.parameters.some((parameter) => parameter.name === binding.expression))
        return [];

      return [
        {
          label: `${part.name}: ${binding.target}`,
          dimension: { parameter: binding.expression, part: part.id, kind: binding.kind, target: binding.target },
        },
      ];
    }),
  );
  const save = async () => {
    const requirements = [...controls.requirements.filter((item) => item.name !== editing), draft];

    if (await controls.apply({ op: 'requirements', requirements })) {
      setDraft(EMPTY);
      setEditing(null);
    }
  };
  const remove = (name: string) =>
    confirmAction({
      title: `Delete ${name}?`,
      confirmLabel: 'Delete',
      onConfirm: () => {
        void controls.apply({
          op: 'remove-requirement',
          name,
        });
      },
    });

  return (
    <Section title="Dimensional tolerances" collapsible defaultOpen={false}>
      <div data-dimensional-requirement className="space-y-2">
        {controls.requirements.map((item) => (
          <div key={item.name} className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => {
                setDraft(item);
                setEditing(item.name);
              }}
            >
              {item.name}
            </Button>
            <IconButton
              title={`Delete ${item.name}`}
              icon={<DeleteIcon />}
              size="xs"
              variant="danger"
              disabled={controls.busy}
              onClick={() => remove(item.name)}
            />
          </div>
        ))}
        <FieldRow label="Name">
          <TextInput
            aria-label="Name"
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        </FieldRow>
        <FieldRow label="Expression">
          <TextInput
            aria-label="Expression"
            value={draft.expression}
            onChange={(event) => setDraft({ ...draft, expression: event.target.value })}
          />
        </FieldRow>
        <FieldRow label="Minimum">
          <TextInput
            aria-label="Minimum"
            value={String(draft.minimum)}
            onChange={(event) => setDraft({ ...draft, minimum: Number(event.target.value) })}
          />
        </FieldRow>
        <FieldRow label="Maximum">
          <TextInput
            aria-label="Maximum"
            value={String(draft.maximum)}
            onChange={(event) => setDraft({ ...draft, maximum: Number(event.target.value) })}
          />
        </FieldRow>
        {choices.map(({ dimension, label }) => {
          const key = JSON.stringify(dimension);
          const checked = draft.dimensions.some((item) => JSON.stringify(item) === key);

          return (
            <Switch
              key={key}
              aria-label={label}
              label={label}
              checked={checked}
              onChange={(value) =>
                setDraft({
                  ...draft,
                  dimensions: value
                    ? [...draft.dimensions, dimension]
                    : draft.dimensions.filter((item) => JSON.stringify(item) !== key),
                })
              }
            />
          );
        })}
        <Button
          size="sm"
          disabled={controls.busy || !draft.name || !draft.expression || !draft.dimensions.length}
          onClick={() => void save()}
        >
          {editing ? 'Save' : 'Add'}
        </Button>
      </div>
    </Section>
  );
}
