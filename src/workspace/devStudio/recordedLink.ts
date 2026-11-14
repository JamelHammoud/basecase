import type { TakeContext } from '../../../electron/robot/robotTake.mjs';
import { TakeTap, type TakeSink } from '../../../electron/robot/takeTap.mjs';
import { saveTake } from '../../cases/tryStore';
import type { RobotLinkApi } from '../../robot/robotStore';
import { statusRadians, type RobotEvent, type RobotMount, type RobotSpec } from '../../robot/robotState';

type Listener = (event: RobotEvent) => void;

const SINK: TakeSink = {
  open: () => {},
  append: () => {},
  finish: ({ kept, take }) => (kept ? saveTake(take.manifest(), take.bytes()) : undefined),
};

const isMount = (m: unknown): m is RobotMount => typeof (m as RobotMount)?.id === 'number';

export function recordedLink(link: RobotLinkApi): RobotLinkApi {
  const listeners = new Set<Listener>();
  const emit: Listener = (event) => listeners.forEach((listen) => listen(event));
  let tap: TakeTap | null = null;
  let context: TakeContext | null = null;
  let calibration: RobotMount[] = [];

  const connect = (spec: RobotSpec) => {
    tap = new TakeTap({
      sink: SINK,
      emit,
      now: () => performance.now(),
      joints: () => (context?.joints.length === spec.ids.length ? context.joints : spec.ids.map((id) => `servo ${id}`)),
      positionsOf: (status) => spec.ids.map((id) => statusRadians(status as never, calibration, id)),
      ids: spec.ids,
    });

    if (context) tap.setContext(context);
  };

  link.onRobotEvent?.((event: RobotEvent) => {
    if (event.event === 'link' && event.state === 'connected') connect(event.spec as RobotSpec);

    if (event.event === 'calibration' && Array.isArray(event.joints)) calibration = event.joints.filter(isMount);

    tap?.event(event);
    emit(event);
  });

  return {
    ...link,
    onRobotEvent: (listen: Listener) => {
      listeners.add(listen);

      return () => listeners.delete(listen);
    },
    robotCommand: async (command) => {
      const reply = (await link.robotCommand?.(command)) ?? { ok: false, message: '' };

      if (reply.ok && command.cmd === 'intent' && Array.isArray(command.joints)) tap?.intent(command.joints);

      return reply;
    },
    robotTakeScene: async (next) => {
      context = next;
      tap?.setContext(next);

      return { ok: true };
    },
    robotTakeSample: async (sample) => {
      tap?.sample(sample);

      return { ok: true };
    },
  };
}
