import React from 'react';
import { CodeFrame } from '../code/CodeFrame';
import { codeFrameKey, type PanelViewProps } from '../panelContext';
import { Titled } from './PanelTitle';

const DEFAULT_HEIGHT = 320;

export const CodePanel: React.FC<PanelViewProps<'code'>> = ({ panel, ctx }) => (
  <Titled title={panel.title}>
    <CodeFrame
      key={codeFrameKey(ctx.bus, panel.source)}
      panel={panel}
      ctx={ctx}
      pointer
      className="rounded-[8px]"
      style={{ height: panel.height ?? DEFAULT_HEIGHT }}
    />
  </Titled>
);
