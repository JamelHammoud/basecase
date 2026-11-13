import React from 'react';
import { BriefSection } from '../../simulate/CaseSections';
import type { PanelViewProps } from '../panelContext';
import { Titled } from './PanelTitle';

export const TextPanel: React.FC<PanelViewProps<'text'>> = ({ panel, ctx }) =>
  'of' in panel ? (
    <BriefSection cases={ctx.cases} />
  ) : (
    <Titled title={panel.title}>
      <p className="text-[13px] leading-snug text-white/70 whitespace-pre-line">{panel.text}</p>
    </Titled>
  );
