import React from 'react';
import { Button, Section } from '../../design-system';
import type { Readiness, ReadinessFinding } from '../../readiness/types';
import type { FindingContext } from './FindingRow';
import { PartLinks } from './PartLinks';

export interface RestoreActions {
  onRestore: (finding: ReadinessFinding) => void;
  onRestoreRule: (rule: string) => void;
}

const RestoreRow: React.FC<{ label: string; onRestore: () => void; children?: React.ReactNode }> = ({
  label,
  onRestore,
  children,
}) => (
  <li className="flex items-start gap-2 py-1.5 px-[7px]">
    <div className="min-w-0 flex-1">
      <p className="text-[13px] leading-[18px] text-white/65">{label}</p>
      {children}
    </div>
    <Button variant="secondary" size="xs" onClick={onRestore}>
      Restore
    </Button>
  </li>
);

export const IgnoredChecks: React.FC<{
  readiness: Readiness;
  context: FindingContext;
  restore: RestoreActions;
}> = ({ readiness, context, restore }) => {
  const count = readiness.ignored.length + readiness.ignoredRules.length;

  if (!count) return null;

  return (
    <Section title={`Ignored (${count})`} collapsible defaultOpen={false} className="!px-0 !pb-0 mt-2 !border-b-0">
      <ul className="-mx-[7px]">
        {readiness.ignoredRules.map((rule) => (
          <RestoreRow
            key={rule.rule}
            label={rule.count ? `All ${rule.name} (${rule.count})` : `All ${rule.name}`}
            onRestore={() => restore.onRestoreRule(rule.rule)}
          />
        ))}
        {readiness.ignored.map((finding) => (
          <RestoreRow key={finding.key} label={finding.text} onRestore={() => restore.onRestore(finding)}>
            <PartLinks
              ids={finding.ids}
              parts={context.parts}
              panScroll={context.panScroll}
              onSelect={context.actions.onSelectParts}
            />
          </RestoreRow>
        ))}
      </ul>
    </Section>
  );
};
