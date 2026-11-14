import React from 'react';
import { NumberInput, Switch } from '../../design-system';
import { ThicknessField } from './ThicknessField';
import type { StudioDraft } from './useStudioDraft';

export const OutputFields: React.FC<{ draft: StudioDraft; depth: boolean; svg?: boolean }> = ({
  draft,
  depth,
  svg = false,
}) => (
  <>
    {(svg || depth) && (
      <div className="grid grid-cols-2 gap-2">
        {svg && (
          <NumberInput
            label="W"
            title="Width"
            value={draft.drawSpanMm}
            min={5}
            max={500}
            precision={0}
            onChange={(v) => draft.setDrawSpanMm(v)}
          />
        )}
        {depth && <ThicknessField value={draft.drawHeightMm} min={svg ? 1 : -250} onChange={draft.setDrawHeightMm} />}
      </div>
    )}
    {svg && <Switch label="Bevel" checked={draft.drawBevel} onChange={draft.setDrawBevel} />}
  </>
);
