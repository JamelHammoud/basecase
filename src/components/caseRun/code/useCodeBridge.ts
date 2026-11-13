import { useEffectEvent, useLayoutEffect, type RefObject } from 'react';
import { openCodeBridge } from '../../../cases/console/codeBridge';
import { setCodeDrive } from '../../../cases/console/codeDrive';
import type { FrameKey } from '../../../cases/console/codeProtocol';
import type { CaseAction } from '../../../cases/console/panelKinds';
import type { FrameSize } from '../../../cases/console/codeStreams';
import type { FactValue } from '../../../cases/caseFacts';
import type { StoreValue } from '../../../cases/caseStore';
import { stagedChange, type WorldChange } from '../../../cases/worldSet';
import type { PanelContext } from '../panelContext';

interface BridgeInput {
  frameRef: RefObject<HTMLIFrameElement | null>;
  ctx: PanelContext;
  onFail: (error: string) => void;
}

const stopNothing = () => undefined;

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
    const staged = stagedChange(ctx.world, change);

    if (typeof staged === 'string') return staged;

    ctx.sim.world(staged);

    return null;
  });
  const frames = useEffectEvent((camera: string, size: FrameSize, onFrame: (bitmap: ImageBitmap) => void) =>
    ctx.studio ? ctx.studio.cameras.stream(camera, size, onFrame) : stopNothing,
  );
  const storeGet = useEffectEvent(() => ctx.studio?.cases.store.get() ?? null);
  const storeSet = useEffectEvent((value: StoreValue) => ctx.studio?.cases.store.set(value));

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
