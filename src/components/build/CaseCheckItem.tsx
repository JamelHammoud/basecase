import React from 'react';
import { caseCheckId } from '../../readiness/caseChecks';
import type { CheckSummary, ReadinessFinding } from '../../readiness/types';
import { CheckIcon } from './CheckIcon';
import { NoteRow, type FindingContext } from './FindingRow';

type FaultRows = NonNullable<CheckSummary['faults']>;

const ROW =
  'w-full flex items-start gap-2 py-1.5 px-[7px] rounded-lg text-left cursor-default hover:bg-white/[0.04]';

const FaultRow: React.FC<{ caseId: string; fault: FaultRows[number]; context: FindingContext }> = ({
  caseId,
  fault,
  context,
}) => (
  <li>
    <button
      type="button"
      data-testid="case-fault-check"
      data-status={fault.status}
      onClick={() => context.onOpenCase?.(caseId, { joint: fault.joint, kind: fault.kind })}
      className={`${ROW} pl-[27px]`}
    >
      <CheckIcon status={fault.status} />
      <span className="min-w-0 flex-1 text-[13px] leading-[18px] text-white/90">
        {fault.label}
        {fault.refusal && <span className="block text-[12px] text-white/50">{fault.refusal}</span>}
      </span>
      {fault.detail && <span className="text-[12px] leading-[18px] text-white/50 tabular">{fault.detail}</span>}
    </button>
  </li>
);

export const CaseCheckItem: React.FC<{
  check: CheckSummary & { caseId: string };
  notes: ReadinessFinding[];
  context: FindingContext;
}> = ({ check, notes, context }) => (
  <li>
    <button
      id={caseCheckId(check.caseId)}
      type="button"
      data-status={check.status}
      onClick={() => context.onOpenCase?.(check.caseId)}
      className={ROW}
    >
      <CheckIcon status={check.status} />
      <span className="min-w-0 flex-1 text-[13px] leading-[18px] text-white/90">{check.name}</span>
      {check.detail && <span className="text-[12px] leading-[18px] text-white/50 tabular">{check.detail}</span>}
    </button>
    {check.faults && (
      <ul>
        {check.faults.map((fault) => (
          <FaultRow key={`${fault.joint}|${fault.kind}`} caseId={check.caseId} fault={fault} context={context} />
        ))}
      </ul>
    )}
    {notes.length > 0 && (
      <ul className="pb-1">
        {notes.map((finding) => (
          <NoteRow key={finding.key} finding={finding} context={context} />
        ))}
      </ul>
    )}
  </li>
);
