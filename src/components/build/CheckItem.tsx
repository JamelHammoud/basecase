import React, { useState } from 'react';
import { ChevronDownIcon } from '../../design-system';
import type { CheckSummary, ReadinessFinding } from '../../readiness/types';
import { CheckIcon } from './CheckIcon';
import { BlockerRow, NoteRow, type FindingContext } from './FindingRow';

export const CheckItem: React.FC<{
  check: CheckSummary;
  blockers: ReadinessFinding[];
  notes: ReadinessFinding[];
  context: FindingContext;
}> = ({ check, blockers, notes, context }) => {
  const [open, setOpen] = useState(false);
  const count = blockers.length + notes.length;
  const hasBody = count > 0 || !!check.detail;

  return (
    <li>
      <button
        type="button"
        aria-expanded={hasBody ? open : undefined}
        disabled={!hasBody}
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start gap-2 py-1.5 px-[7px] rounded-lg text-left cursor-default enabled:hover:bg-white/[0.04]"
      >
        <CheckIcon status={check.status} />
        <span
          className={`min-w-0 flex-1 text-[13px] leading-[18px] ${check.status === 'not run' ? 'text-white/50' : 'text-white/90'}`}
        >
          {check.name}
        </span>
        {count > 0 && <span className="text-[12px] leading-[18px] text-white/45 tabular">{count}</span>}
        {hasBody && (
          <span className="h-[18px] flex items-center shrink-0">
            <ChevronDownIcon
              className={`w-3.5 h-3.5 text-white/40 transition-transform duration-150 ${open ? '' : '-rotate-90'}`}
            />
          </span>
        )}
      </button>
      {open && hasBody && (
        <div className="pb-1">
          {check.detail && (
            <p className="pl-[31px] pr-[7px] pb-0.5 text-[12.5px] leading-[17px] text-white/50">{check.detail}</p>
          )}
          <ul>
            {blockers.map((finding) => (
              <BlockerRow key={finding.key} finding={finding} context={context} />
            ))}
            {notes.map((finding) => (
              <NoteRow key={finding.key} finding={finding} context={context} />
            ))}
          </ul>
        </div>
      )}
    </li>
  );
};
