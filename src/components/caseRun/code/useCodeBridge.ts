import { useEffectEvent, useLayoutEffect, type RefObject } from 'react';
import { openCodeBridge } from '../../../cases/console/codeBridge';
import { codeSourceFirstLine } from '../../../cases/console/codeDocument';
import { setCodeDrive } from '../../../cases/console/codeDrive';
import type { FrameKey } from '../../../cases/console/codeProtocol';
import { CASE_STORES, caseStoreKey, storeOf } from '../../../cases/console/codeStore';
import { codePanelKey, watchCodeReport } from '../../../cases/console/codeReports';
import type { FrameSize } from '../../../cases/console/codeStreams';
import type { CaseAction, PanelOf } from '../../../cases/console/panelKinds';
import type { FactValue } from '../../../cases/caseFacts';
import { stagedChange, type WorldChange } from '../../../cases/worldSet';
import type { PanelContext } from '../panelContext';

interface BridgeInput {
  frameRef: RefObject<HTMLIFrameElement | null>;
  panel: PanelOf<'code'>;
  ctx: PanelContext;
  onFail: (error: string) => void;
}

const stopNothing = () => undefined;

const storeFor = (key: string | null) => (key ? storeOf(CASE_STORES, key) : null);

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
  const world = useEffectEvent((change: WorldChange) => {
    const staged = stagedChange(ctx.world, change);

    if (typeof staged === 'string') return staged;

    ctx.sim.world(staged);

    return null;
  });
  const storeKey = useEffectEvent(() => {
    const cases = ctx.studio?.cases;

    return cases?.active ? caseStoreKey(cases.sceneId, cases.active.id) : null;
  });
  const frames = useEffectEvent((camera: string, size: FrameSize, onFrame: (bitmap: ImageBitmap) => void) =>
    ctx.studio ? ctx.studio.cameras.stream(camera, size, onFrame) : stopNothing,
  );

  useLayoutEffect(() => {
    const owner = {};
    const bridge = openCodeBridge({
      frame: () => frameRef.current?.contentWindow,
      ...current(),
      studio: {
        drive: (command) => setCodeDrive(owner, command),
        event,
        can,
        fire,
        key: pressStudioKey,
        world,
        frames,
        store: storeFor(storeKey()),
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
