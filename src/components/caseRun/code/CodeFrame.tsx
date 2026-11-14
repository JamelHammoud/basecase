import React, { useRef, useState } from 'react';
import { CODE_PANEL_SANDBOX, codePanelDocument } from '../../../cases/console/codeDocument';
import type { PanelOf } from '../../../cases/console/panelKinds';
import type { PanelContext } from '../panelContext';
import { useCodeBridge } from './useCodeBridge';

interface CodeFrameProps {
  panel: PanelOf<'code'>;
  ctx: PanelContext;
  pointer: boolean;
  className: string;
  style?: React.CSSProperties;
}

function LiveFrame({
  panel,
  ctx,
  pointer,
  className,
  style,
  onFail,
}: CodeFrameProps & { onFail: (e: string) => void }) {
  const frameRef = useRef<HTMLIFrameElement>(null);

  useCodeBridge({ frameRef, panel, ctx, onFail });

  return (
    <iframe
      ref={frameRef}
      data-testid="code-frame"
      data-code-panel={panel.id}
      title={panel.title ?? panel.id}
      sandbox={CODE_PANEL_SANDBOX}
      referrerPolicy="no-referrer"
      srcDoc={codePanelDocument(panel.source)}
      className={`block w-full border-0 bg-transparent ${className}`}
      style={{ ...style, pointerEvents: pointer ? 'auto' : 'none', colorScheme: 'dark' }}
    />
  );
}

export const CodeFrame: React.FC<CodeFrameProps> = (props) => {
  const [failed, setFailed] = useState<string | null>(null);

  if (failed !== null)
    return (
      <p data-testid="code-failed" className="text-[13px] leading-snug text-white/70">
        Couldn’t run {props.panel.title ?? 'this panel'}. {failed}
      </p>
    );

  return <LiveFrame {...props} onFail={setFailed} />;
};
