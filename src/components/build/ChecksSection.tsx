import React from 'react';
import { Section } from '../../design-system';
import { ownedBy } from '../../readiness/readiness';
import type { CheckStatus, CheckSummary, Readiness } from '../../readiness/types';
import { READINESS_CHECKS } from '../../readiness/wording';
import { ENGINEERING_CHECKS, STRENGTH_CHECK } from '../../utils/engineering';
import { CaseCheckItem } from './CaseCheckItem';
import { CheckIcon } from './CheckIcon';
import { CheckItem } from './CheckItem';
import type { FindingContext } from './FindingRow';
import { IgnoredChecks, type RestoreActions } from './IgnoredChecks';

interface ChecksSectionProps {
  readiness: Readiness | null;
  checking: boolean;
  context: FindingContext;
  restore: RestoreActions;
}

const SEVERITY: Record<CheckStatus, number> = { fail: 0, warn: 1, pass: 2, 'not run': 3 };

const bySeverity = (checks: CheckSummary[]) => [...checks].sort((a, b) => SEVERITY[a.status] - SEVERITY[b.status]);

const FIRST_RUN = [...READINESS_CHECKS, ...ENGINEERING_CHECKS];

const stressIdsOf = (readiness: Readiness, name: string) =>
  name === STRENGTH_CHECK ? readiness.rows.find((r) => r.check === name)?.ids : undefined;

function verdict(readiness: Readiness | null, checking: boolean): { text: string; tone: string } {
  if (!readiness || checking) return { text: 'Checking…', tone: 'text-white/50' };

  if (readiness.status === 'ready') return { text: 'Ready to build', tone: 'text-emerald-400' };

  return { text: `${readiness.blockers.length} to fix`, tone: 'text-red-400' };
}

const Checking: React.FC<{ name: string }> = ({ name }) => (
  <li className="flex items-start gap-2 py-1.5 px-[7px]">
    <CheckIcon status="checking" />
    <span className="text-[13px] leading-[18px] text-white/60">{name}</span>
  </li>
);

const entryKey = (check: CheckSummary) => (check.caseId ? `case:${check.caseId}` : check.name);

const Entry: React.FC<{ check: CheckSummary; readiness: Readiness; context: FindingContext }> = ({
  check,
  readiness,
  context,
}) => {
  const notes = readiness.notes.filter(ownedBy(check));

  if (check.caseId) return <CaseCheckItem check={{ ...check, caseId: check.caseId }} notes={notes} context={context} />;

  const blockers = readiness.blockers.filter(ownedBy(check));
  const stressIds = stressIdsOf(readiness, check.name);

  return <CheckItem check={check} blockers={blockers} notes={notes} context={context} stressIds={stressIds} />;
};

export const ChecksSection: React.FC<ChecksSectionProps> = ({ readiness, checking, context, restore }) => {
  if (!context.parts.length || readiness?.status === 'empty') return null;

  const { text, tone } = verdict(readiness, checking);

  return (
    <Section title="Checks" actions={<span className={`text-[13px] ${tone}`}>{text}</span>}>
      <ul className="-mx-[7px]">
        {!readiness && FIRST_RUN.map((name) => <Checking key={name} name={name} />)}
        {readiness &&
          bySeverity(readiness.checks).map((check) => (
            <Entry key={entryKey(check)} check={check} readiness={readiness} context={context} />
          ))}
      </ul>
      {readiness && <IgnoredChecks readiness={readiness} context={context} restore={restore} />}
    </Section>
  );
};
