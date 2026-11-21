import React, { useEffect } from 'react';
import { showStress } from '../../strength/fields';
import { Button, DisclosureRow } from '../../design-system';
import { shownDetail } from '../../readiness/shownDetail';
import type { CheckSummary, ReadinessFinding } from '../../readiness/types';
import { CheckIcon } from './CheckIcon';
import { EnvelopeRows, FindingPlot, unlisted } from './EnvelopeRows';
import { BlockerRow, NoteRow, type FindingContext } from './FindingRow';
import { TetherFields } from './TetherFields';
import { tetherFieldsFor } from './tetherRows';
import { BoardBuildAction } from './BoardBuildAction';

const boardFor = (check: CheckSummary, context: FindingContext) =>
  check.name === 'Electrical connections' && !context.readOnly ? context.board : undefined;

function currentInspection(name: string, inspect?: () => void) {
  if (name !== 'Electrical connections' || !inspect) return null;

  return (
    <Button variant="secondary" onClick={inspect}>
      Inspect Current
    </Button>
  );
}

export const CheckItem: React.FC<{
  check: CheckSummary;
  blockers: ReadinessFinding[];
  notes: ReadinessFinding[];
  context: FindingContext;
  stressIds?: string[];
  open: boolean;
  onToggle: () => void;
}> = ({ check, blockers, notes, context, stressIds, open, onToggle }) => {
  useEffect(() => (open && stressIds?.length ? showStress(stressIds) : undefined), [open, stressIds]);

  const count = blockers.length + notes.length;
  const detail = shownDetail(check, [...blockers, ...notes]);
  const fields = tetherFieldsFor(check.name, context.tether?.tether);
  const board = boardFor(check, context);
  const inspection = currentInspection(check.name, context.onInspectCurrent);
  const hasBody = [board, inspection, count, fields.length, detail, check.envelopes?.length].some(Boolean);
  const showDots = context.showDots;

  useEffect(() => {
    if (!open || !check.hasDots || !showDots) return;

    showDots(check.name);

    return () => showDots(null);
  }, [open, check.hasDots, check.name, showDots]);

  return (
    <li data-check={check.name} data-status={check.status}>
      <DisclosureRow open={open} onToggle={onToggle} disabled={!hasBody}>
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
          {board && <BoardBuildAction {...board} />}
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
          {inspection && <div className="pl-[31px] pr-[7px] py-1">{inspection}</div>}
          {check.envelopes && <EnvelopeRows envelopes={unlisted(check.envelopes, [...blockers, ...notes])} />}
        </div>
      )}
    </li>
  );
};
