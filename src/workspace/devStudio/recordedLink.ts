import { OperateRecorder } from '../../../electron/robot/operateRecorder.mjs';
import { readStoredTry } from '../../cases/tryFile';
import { keepSession } from '../../cases/tryStore';
import type { RobotLinkApi } from '../../robot/robotStore';
import { applyRobotEvent, INITIAL_ROBOT, type RobotEvent, type RobotState } from '../../robot/robotState';
import { statusPositions } from '../../robot/runBuffer';

type Listener = (event: RobotEvent) => void;

interface Recording {
  recorder: OperateRecorder | null;
  state: RobotState;
  texts: Map<string, string>;
  saving: Promise<unknown>;
}

function sinkOf(rec: Recording) {
  return {
    append: (id: string, text: string) => rec.texts.set(id, (rec.texts.get(id) ?? '') + text),
    keep: (manifest: Record<string, unknown>) => {
      const stored = readStoredTry(manifest);
      const text = rec.texts.get(String(manifest.id)) ?? '';

      rec.texts.delete(String(manifest.id));

      if (stored) rec.saving = keepSession(stored, text);
    },
    drop: (id: string) => rec.texts.delete(id),
  };
}

function recorderFor(rec: Recording, event: RobotEvent, forward: Listener) {
  const spec = event.spec as { family: string; ids: number[] };

  return new OperateRecorder({
    spec,
    sink: sinkOf(rec),
    radians: (status) => statusPositions(status as never, spec.ids, rec.state.calibration),
    onClosed: (closed) => void rec.saving.then(() => forward({ event: 'recorded', ...closed })),
  });
}

function observe(rec: Recording, event: RobotEvent, forward: Listener) {
  const closing = event.event === 'link' && event.state !== 'connected';

  if (closing) rec.recorder?.close('disconnect');

  if (closing) rec.recorder = null;

  if (event.event === 'link' && event.state === 'connected') rec.recorder = recorderFor(rec, event, forward);

  rec.state = applyRobotEvent(rec.state, event);
  forward(event);
  rec.recorder?.event(event);
}

export function recordedLink(link: RobotLinkApi): RobotLinkApi {
  const rec: Recording = { recorder: null, state: INITIAL_ROBOT, texts: new Map(), saving: Promise.resolve() };
  const running = () => rec.state.status?.run === 'running';

  return {
    ...link,
    onRobotEvent: (callback) => link.onRobotEvent?.((event) => observe(rec, event, callback)) ?? (() => {}),
    robotCommand: async (command) => {
      const reply = (await link.robotCommand?.(command)) ?? { ok: false, message: '' };

      if (reply.ok && command.cmd === 'intent' && running()) rec.recorder?.intent(command.joints as number[]);

      return reply;
    },
    robotRecord: async (sample) => {
      if ('scene' in sample) rec.recorder?.setContext(sample.scene);
      else rec.recorder?.sample(sample);

      return { ok: true };
    },
  };
}
