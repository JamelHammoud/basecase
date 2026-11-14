import React from 'react';
import type { CaseAction } from '../../../cases/console/panelKinds';
import { Button } from '../../../design-system';
import type { PanelViewProps } from '../panelContext';

const LABELS: Record<CaseAction, string> = {
  try: 'Try It',
  'end-try': 'Stop Try',
  drive: 'Drive',
  stop: 'Stop Driving',
  'start-over': 'Start Over',
  reset: 'Reset',
};

export const ButtonPanel: React.FC<PanelViewProps<'button'>> = ({ panel, ctx }) => (
  <div className="px-[12px] py-3">
    <Button
      variant={panel.action === 'try' ? 'primary' : 'secondary'}
      size="md"
      fullWidth
      disabled={!ctx.can(panel.action)}
      onClick={() => ctx.fire(panel.action)}
    >
      {panel.title ?? LABELS[panel.action]}
    </Button>
  </div>
);
