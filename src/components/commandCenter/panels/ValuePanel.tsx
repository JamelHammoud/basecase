import React from 'react';
import { useBus, type PanelViewProps } from '../panelContext';
import { Titled } from './PanelTitle';
import { signalText } from './signalText';

export const ValuePanel: React.FC<PanelViewProps<'value'>> = ({ panel, ctx }) => {
  useBus(ctx.bus);

  return (
    <Titled title={panel.title ?? panel.signal}>
      <div className="text-[28px] leading-[36px] font-semibold tabular-nums text-white/90" data-signal={panel.signal}>
        {signalText(panel.signal, ctx.bus.read(panel.signal), ctx.signals)}
      </div>
    </Titled>
  );
};
