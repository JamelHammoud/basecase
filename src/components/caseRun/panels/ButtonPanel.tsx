import React from 'react';
import { ACTION_LABELS } from '../../../cases/console/panelNames';
import { Button } from '../../../design-system';
import type { PanelViewProps } from '../panelContext';

export const ButtonPanel: React.FC<PanelViewProps<'button'>> = ({ panel, ctx }) => (
  <div className="px-[12px] py-3">
    <Button
      variant={panel.action === 'try' ? 'primary' : 'secondary'}
      size="md"
      fullWidth
      disabled={!ctx.can(panel.action)}
      onClick={() => ctx.fire(panel.action)}
    >
      {panel.title ?? ACTION_LABELS[panel.action]}
    </Button>
  </div>
);
