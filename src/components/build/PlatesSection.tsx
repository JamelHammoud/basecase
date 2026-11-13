import React from 'react';
import { Button, MetaLine, Section } from '../../design-system';
import type { Plate } from '../../print/plan';
import type { SlicedPlate } from '../../print/printBridge';
import type { Printing } from '../../workspace/usePrinting';
import { plural } from '../../utils/plural';
import { hm } from './format';
import { plateNumbers } from '../print/plateFacts';

interface PlateTotals {
  hours: number;
  exact: boolean;
}

function plateTotals(plates: Plate[], sliced: Array<SlicedPlate | undefined>): PlateTotals {
  return plates.reduce<PlateTotals>(
    (t, p, i) => {
      const n = plateNumbers(p, sliced[i]);

      return { hours: t.hours + n.hours, exact: t.exact && n.exact };
    },
    { hours: 0, exact: true },
  );
}

export const PlatesSection: React.FC<{ printing: Printing }> = ({ printing }) => {
  const plates = printing.report?.plan.plates ?? [];

  if (!plates.length) return null;

  const totals = plateTotals(
    plates,
    plates.map((p) => printing.freshSlice(p)),
  );

  return (
    <Section title="Printing">
      <div className="flex items-center justify-between gap-3">
        <MetaLine
          className="text-[13px] text-white/90 tabular-nums"
          items={[
            plural(plates.length, 'plate'),
            `${totals.exact ? '' : '≈ '}${hm(totals.hours)}`,
          ]}
        />
        <Button size="sm" variant="secondary" title="Print" shortcut="⌘P" onClick={() => printing.openMode(1)}>
          Print
        </Button>
      </div>
    </Section>
  );
};
