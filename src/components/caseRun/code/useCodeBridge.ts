import { useEffectEvent, useLayoutEffect, type RefObject } from 'react';
import { openCodeBridge } from '../../../cases/console/codeBridge';
import { codeSourceFirstLine } from '../../../cases/console/codeDocument';
import { setCodeDrive } from '../../../cases/console/codeDrive';
import type { FrameKey } from '../../../cases/console/codeProtocol';
import { codePanelKey, watchCodeReport } from '../../../cases/console/codeReports';
import type { CaseAction, PanelOf } from '../../../cases/console/panelKinds';
import type { FactValue } from '../../../cases/caseFacts';
import type { PanelContext } from '../panelContext';

interface BridgeInput {
  frameRef: RefObject<HTMLIFrameElement | null>;
  panel: PanelOf<'code'>;
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
  const watchKey = useEffectEvent(() => ({
    key: codePanelKey(ctx.studio?.cases.active?.id ?? '', panel.id),
    source: panel.source,
  }));
  const can = useEffectEvent((action: CaseAction) => ctx.can(action));
  const fire = useEffectEvent((action: CaseAction) => ctx.fire(action));
  const event = useEffectEvent((name: string, value: FactValue) => ctx.sim.input(name, value));
  const failed = useEffectEvent((error: string) => onFail(error));
  const tools = useEffectEvent(() => ctx.tools);

  useLayoutEffect(() => {
    const owner = {};
    const bridge = openCodeBridge({
      frame: () => frameRef.current?.contentWindow,
      ...current(),
      studio: { drive: (command) => setCodeDrive(owner, command), event, can, fire, key: pressStudioKey },
      tools: {
        world: { objects: () => tools().world?.objects() ?? [], set: (change) => tools().world?.set(change) },
        store: { read: () => tools().store?.read(), write: (next) => tools().store?.write(next) },
        frames: (request) => tools().frames?.(request) ?? 'no camera feed here',
      },
      onFail: failed,
      firstLine: codeSourceFirstLine(),
    });
    const { key, source } = watchKey();
    const listen = (e: MessageEvent) => bridge.receive(e);

    watchCodeReport(key, source, bridge.report);
    window.addEventListener('message', listen);

    return () => {
      window.removeEventListener('message', listen);
      bridge.close();
    };
  }, [frameRef]);
}
