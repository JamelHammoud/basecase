import { useEffectEvent, useLayoutEffect, type RefObject } from 'react';
import { openCodeBridge } from '../../../cases/console/codeBridge';
import { setCodeDrive } from '../../../cases/console/codeDrive';
import type { FrameKey } from '../../../cases/console/codeProtocol';
import type { CaseAction } from '../../../cases/console/panelKinds';
import type { FactValue } from '../../../cases/caseFacts';
import type { PanelContext } from '../panelContext';

interface BridgeInput {
  frameRef: RefObject<HTMLIFrameElement | null>;
  panel: string;
  ctx: PanelContext;
  onFail: (error: string) => void;
}

export const pressStudioKey = ({ key, meta, ctrl, shift }: FrameKey) =>
  window.dispatchEvent(
    new KeyboardEvent('keydown', {
      key,
      metaKey: meta,
      ctrlKey: ctrl,
      shiftKey: shift,
      bubbles: true,
      cancelable: true,
    }),
  );

export function useCodeBridge({ frameRef, panel, ctx, onFail }: BridgeInput) {
  const current = useEffectEvent(() => ({ bus: ctx.bus, scope: ctx.scope, inputs: ctx.inputs }));
  const can = useEffectEvent((action: CaseAction) => ctx.can(action));
  const fire = useEffectEvent((action: CaseAction) => ctx.fire(action));
  const event = useEffectEvent((name: string, value: FactValue) => ctx.sim.input(name, value));
  const failed = useEffectEvent((error: string) => onFail(error));

  useLayoutEffect(() => {
    const bridge = openCodeBridge({
      panel,
      frame: () => frameRef.current?.contentWindow,
      ...current(),
      studio: { drive: (command) => setCodeDrive(panel, command), event, can, fire, key: pressStudioKey },
      onFail: failed,
    });
    const listen = (e: MessageEvent) => bridge.receive(e);

    window.addEventListener('message', listen);

    return () => {
      window.removeEventListener('message', listen);
      bridge.close();
    };
  }, [panel, frameRef]);
}
