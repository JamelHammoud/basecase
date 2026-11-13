import { useEffectEvent, useLayoutEffect, type RefObject } from 'react';
import { openCodeBridge } from '../../../cases/console/codeBridge';
import { setCodeDrive } from '../../../cases/console/codeDrive';
import type { FrameKey } from '../../../cases/console/codeProtocol';
import type { CaseAction } from '../../../cases/console/panelKinds';
import type { FrameSize } from '../../../cases/console/codeStreams';
import type { FactValue } from '../../../cases/caseFacts';
import type { StoreValue } from '../../../cases/caseStore';
import { worldRefusal, type WorldChange } from '../../../cases/worldSet';
import type { PanelContext } from '../panelContext';

interface BridgeInput {
  frameRef: RefObject<HTMLIFrameElement | null>;
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

export function useCodeBridge({ frameRef, ctx, onFail }: BridgeInput) {
  const current = useEffectEvent(() => ({ bus: ctx.bus, scope: ctx.scope, inputs: ctx.inputs }));
  const can = useEffectEvent((action: CaseAction) => ctx.can(action));
  const fire = useEffectEvent((action: CaseAction) => ctx.fire(action));
  const event = useEffectEvent((name: string, value: FactValue) => ctx.sim.input(name, value));
  const failed = useEffectEvent((error: string) => onFail(error));
  const world = useEffectEvent((change: WorldChange) => {
    const refusal = worldRefusal(ctx.cases.active?.world.objects ?? [], change.id);

    if (!refusal) ctx.sim.world(change);

    return refusal;
  });
  const frames = useEffectEvent((camera: string, size: FrameSize, onFrame: (bitmap: ImageBitmap) => void) =>
    ctx.cameras.stream(camera, size, onFrame),
  );
  const storeGet = useEffectEvent(() => ctx.cases.store.get());
  const storeSet = useEffectEvent((value: StoreValue) => ctx.cases.store.set(value));

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
        store: { get: storeGet, set: storeSet },
      },
      onFail: failed,
    });
    const listen = (e: MessageEvent) => bridge.receive(e);

    window.addEventListener('message', listen);

    return () => {
      window.removeEventListener('message', listen);
      bridge.close();
    };
  }, [frameRef]);
}
