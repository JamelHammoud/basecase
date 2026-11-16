import { useState } from 'react';
import { ConfirmDialog, Button, Select, TextInput } from '../../design-system';

export interface GroupMapping {
  group: string;
  roles: string[];
}
export interface AccessRole {
  id: string;
  name: string;
}

export function FleetMappings({
  mappings,
  roles,
  onChange,
}: {
  mappings: GroupMapping[];
  roles: AccessRole[];
  onChange: (mappings: GroupMapping[]) => void;
}) {
  const [pending, setPending] = useState<number | null>(null);
  const knownRoles = new Set(roles.map((role) => role.id));
  const unlistedRoles = [...new Set(mappings.flatMap((mapping) => mapping.roles))].filter(
    (role) => !knownRoles.has(role),
  );
  const options = [
    { value: '', label: 'Choose Role' },
    ...roles.map((role) => ({ value: role.id, label: role.name })),
    ...unlistedRoles.map((role) => ({ value: role, label: role })),
  ];

  return (
    <fieldset className="space-y-3">
      <legend>Group grants</legend>
      {mappings.map((mapping, index) => (
        <div key={index} className="flex gap-3">
          <TextInput
            aria-label="Provider group"
            value={mapping.group}
            required
            maxLength={200}
            onChange={(event) =>
              onChange(mappings.map((item, at) => (at === index ? { ...item, group: event.target.value } : item)))
            }
          />
          <div className="min-w-0 flex-1 space-y-2">
            {(mapping.roles.length ? mapping.roles : ['']).map((role, roleIndex) => (
              <Select
                key={roleIndex}
                aria-label="Fleet role"
                value={role}
                options={options}
                onChange={(event) => {
                  const nextRoles = [...mapping.roles];

                  nextRoles[roleIndex] = event.target.value;
                  onChange(mappings.map((item, at) => (at === index ? { ...item, roles: nextRoles } : item)));
                }}
              />
            ))}
          </div>
          <Button type="button" variant="danger" onClick={() => setPending(index)}>
            Delete
          </Button>
        </div>
      ))}
      <Button
        type="button"
        disabled={mappings.length >= 32}
        onClick={() => onChange([...mappings, { group: '', roles: [] }])}
      >
        Add Group Grant
      </Button>
      <ConfirmDialog
        isOpen={pending !== null}
        title="Delete group grant?"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          onChange(mappings.filter((_mapping, index) => index !== pending));
          setPending(null);
        }}
      />
    </fieldset>
  );
}
