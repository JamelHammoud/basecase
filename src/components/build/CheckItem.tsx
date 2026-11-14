import React, { useEffect, useState } from 'react';
import { showStress } from '../../strength/fields';
import { DisclosureRow } from '../../design-system';
import { shownDetail } from '../../readiness/shownDetail';
import type { CheckSummary, ReadinessFinding } from '../../readiness/types';
import { CheckIcon } from './CheckIcon';
import { EnvelopeRows, FindingPlot, unlisted } from './EnvelopeRows';
import { BlockerRow, NoteRow, type FindingContext } from './FindingRow';
import { TetherFields } from './TetherFields';
import { tetherFieldsFor } from './tetherRows';

export const CheckItem: React.FC<{
  check: CheckSummary;
  blockers: ReadinessFinding[];
  notes: ReadinessFinding[];
  context: FindingContext;
  stressIds?: string[];
}> = ({ check, blockers, notes, context, stressIds }) => {
  const [open, setOpen] = useState(false);

  useEffect(() => (open && stressIds?.length ? showStress(stressIds) : undefined), [open, stressIds]);

  const count = blockers.length + notes.length;
  const detail = shownDetail(check, [...blockers, ...notes]);
  const fields = tetherFieldsFor(check.name, context.tether?.tether);
  const hasBody = count > 0 || fields.length > 0 || !!detail || !!check.envelopes?.length;
  const showDots = context.showDots;

  useEffect(() => {
    if (!open || !check.hasDots || !showDots) return;

    showDots(check.name);

    return () => showDots(null);
  }, [open, check.hasDots, check.name, showDots]);

  return (
    <li data-check={check.name} data-status={check.status}>
      <DisclosureRow open={open} onToggle={() => setOpen((v) => !v)} disabled={!hasBody}>
        <CheckIcon status={check.status} />
        <span
          className={`min-w-0 flex-1 text-[13px] leading-[18px] ${check.status === 'not run' ? 'text-white/50' : 'text-white/90'}`}
        >
          {check.name}
        </span>
        {count > 0 && <span className="text-[12px] leading-[18px] text-white/50 tabular">{count}</span>}
      </DisclosureRow>
      {open && hasBody && (
        <div className="pb-1">
          {detail && <p className="pl-[31px] pr-[7px] pb-0.5 text-[12.5px] leading-[17px] text-white/50">{detail}</p>}
          {context.tether && fields.length > 0 && <TetherFields fields={fields} control={context.tether} />}
          <ul>
            {blockers.map((finding) => (
              <BlockerRow key={finding.key} finding={finding} context={context}>
                <FindingPlot finding={finding} envelopes={check.envelopes} />
              </BlockerRow>
            ))}
            {notes.map((finding) => (
              <NoteRow key={finding.key} finding={finding} context={context}>
                <FindingPlot finding={finding} envelopes={check.envelopes} />
              </NoteRow>
            ))}
          </ul>
          {check.envelopes && <EnvelopeRows envelopes={unlisted(check.envelopes, [...blockers, ...notes])} />}
        </div>
      )}
    </li>
  );
};
