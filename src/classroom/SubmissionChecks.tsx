import { useState } from 'react';
import { CheckIcon } from '../components/build/CheckIcon';
import { DisclosureRow } from '../design-system';
import type { CheckRow } from '../utils/engineeringTypes';

export function SubmissionChecks({ checks }: { checks: CheckRow[] }) {
  const [open, setOpen] = useState<number[]>([]);

  return (
    <ul className="text-[13px]">
      {checks
        .filter((check) => check.status !== 'not run' || check.check === 'Budget')
        .map((check, index) => (
          <li key={index} data-check={check.check} data-status={check.status}>
            <DisclosureRow
              open={open.includes(index)}
              onToggle={() =>
                setOpen((current) =>
                  current.includes(index) ? current.filter((at) => at !== index) : [...current, index],
                )
              }
              className="px-0 min-h-[32px]"
            >
              <CheckIcon status={check.status} />
              <span className="min-w-0 flex-1">{check.check}</span>
            </DisclosureRow>
            {open.includes(index) && <p className="pl-6 pb-2 text-white/60 whitespace-pre-wrap">{check.detail}</p>}
          </li>
        ))}
    </ul>
  );
}
