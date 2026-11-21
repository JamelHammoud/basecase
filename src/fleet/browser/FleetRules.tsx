import { useEffect, useState } from 'react';
import { Button, ConfirmDialog, Select, Switch } from '../../design-system';
import { useAccessRequest } from './accessSession';
import type { AccessRule } from './accessTypes';
import { FleetConditions } from './FleetConditions';
import { FleetScope } from './FleetScope';

export function FleetRules({
  org,
  rules,
  onChange,
}: {
  org: string;
  rules: AccessRule[];
  onChange: (rules: AccessRule[]) => void;
}) {
  const request = useAccessRequest();
  const [actions, setActions] = useState<string[]>([]);
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    void request<{ actions: string[] }>(`${org}/contracts`)
      .then((result) => {
        if (active) setActions(result.actions);
      })
      .catch(() => {
        if (active) setError('Check your Fleet credentials.');
      });

    return () => {
      active = false;
    };
  }, [org, request]);

  function change(index: number, rule: AccessRule) {
    onChange(rules.map((item, at) => (at === index ? rule : item)));
  }

  return (
    <fieldset className="space-y-4">
      <legend>Rules</legend>
      {rules.map((rule, index) => (
        <fieldset key={index} className="space-y-3 rounded-xl bg-[#282828] p-3">
          <Select
            aria-label="Effect"
            value={rule.effect}
            options={[
              { value: 'allow', label: 'Allow' },
              { value: 'deny', label: 'Deny' },
            ]}
            onChange={(event) => change(index, { ...rule, effect: event.target.value })}
          />
          <FleetScope org={org} value={rule.scope} onChange={(scope) => change(index, { ...rule, scope })} />
          <fieldset>
            <legend>Actions</legend>
            {[...new Set([...actions, ...rule.actions])].map((action) => (
              <Switch
                key={action}
                label={action}
                aria-label={action}
                checked={rule.actions.includes(action)}
                onChange={(checked) =>
                  change(index, {
                    ...rule,
                    actions: checked ? [...rule.actions, action] : rule.actions.filter((item) => item !== action),
                  })
                }
              />
            ))}
          </fieldset>
          <FleetConditions
            value={rule.conditions ?? {}}
            onChange={(conditions) => change(index, { ...rule, conditions })}
          />
          <Button type="button" variant="danger" onClick={() => setPending(index)}>
            Delete
          </Button>
        </fieldset>
      ))}
      {error && <p role="alert">{error}</p>}
      <Button
        type="button"
        disabled={rules.length >= 64 || !actions.length}
        onClick={() => onChange([...rules, { effect: 'allow', scope: '*', actions: [], conditions: {} }])}
      >
        Add Rule
      </Button>
      <ConfirmDialog
        isOpen={pending !== null}
        title="Delete rule?"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          onChange(rules.filter((_item, index) => index !== pending));
          setPending(null);
        }}
      />
    </fieldset>
  );
}
