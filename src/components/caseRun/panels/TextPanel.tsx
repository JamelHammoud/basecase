import React from 'react';
import type { PanelViewProps } from '../panelContext';
import { Titled } from './PanelTitle';

export const TextPanel: React.FC<PanelViewProps<'text'>> = ({ panel, ctx }) => (
  <Titled title={panel.title}>
    <p className="text-[13px] leading-snug text-white/60 whitespace-pre-line" data-testid="case-brief">
      {'of' in panel ? ctx.brief : panel.text}
    </p>
  </Titled>
);
