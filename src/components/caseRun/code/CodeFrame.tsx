import React, { useEffect, useEffectEvent, useRef, useState } from 'react';
import { CODE_PANEL_SANDBOX, codePanelDocument } from '../../../cases/console/codeDocument';
import { FRAME_END_MS } from '../../../cases/console/codeProtocol';
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

interface Failure {
  error: string;
  ended: boolean;
}

interface LiveFrameProps extends CodeFrameProps {
  ending: boolean;
  onFail: (error: string) => void;
  onEnded: () => void;
}

function LiveFrame({ panel, ctx, pointer, className, style, ending, onFail, onEnded }: LiveFrameProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const ended = useEffectEvent(onEnded);

  useCodeBridge({ frameRef, panel, ctx, onFail });

  useEffect(() => {
    if (!ending) return;

    const timer = setTimeout(ended, FRAME_END_MS);

    return () => clearTimeout(timer);
  }, [ending]);

  return (
    <iframe
      ref={frameRef}
      data-testid="code-frame"
      data-code-panel={panel.id}
      title={panel.title ?? panel.id}
      sandbox={CODE_PANEL_SANDBOX}
      referrerPolicy="no-referrer"
      srcDoc={ending ? undefined : codePanelDocument(panel.source)}
      onLoad={ending ? onEnded : undefined}
      className={`block w-full border-0 bg-transparent ${className}`}
      style={{ ...style, pointerEvents: pointer ? 'auto' : 'none', colorScheme: 'dark' }}
    />
  );
}

export const CodeFrame: React.FC<CodeFrameProps> = (props) => {
  const [failure, setFailure] = useState<Failure | null>(null);

  if (failure?.ended)
    return (
      <p data-testid="code-failed" className="text-[13px] leading-snug text-white/60">
        Couldn’t run {props.panel.title ?? 'this panel'}. {failure.error}
      </p>
    );

  return (
    <LiveFrame
      {...props}
      ending={failure !== null}
      onFail={(error) => setFailure({ error, ended: false })}
      onEnded={() => setFailure((f) => f && { ...f, ended: true })}
    />
  );
};
