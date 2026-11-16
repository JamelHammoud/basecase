import { OperateRecorder } from '../../../electron/robot/operateRecorder.mjs';
import { readStoredTry } from '../../cases/tryFile';
import { keepSession } from '../../cases/tryStore';
import { DEFAULT_UNIT } from '../../../electron/robot/units.mjs';
import type { RobotLinkApi } from '../../robot/robotStore';
import { unitOfEvent } from '../../robot/robotUnits';
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
    onClosed: (closed) =>
      void rec.saving.then(() => forward({ event: 'recorded', ...closed, unit: unitOfEvent(event) })),
  });
}

function observe(rec: Recording, event: RobotEvent, forward: Listener) {
  const closing = event.event === 'link' && event.state !== 'connected';

  if (closing) rec.recorder?.close('disconnect');

  if (closing) rec.recorder = null;

  if (event.event === 'link' && event.state === 'connected') rec.recorder = recorderFor(rec, event, forward);

  rec.state = applyRobotEvent(rec.state, event);
  forward({ ...event, context: rec.recorder?.incidentContext() });
  rec.recorder?.event(event);
}

function recordingsOf() {
  const recordings = new Map<string, Recording>();

  return (unit: string | undefined) => {
    const name = unit ?? DEFAULT_UNIT;
    const known = recordings.get(name);

    if (known) return known;

    const rec: Recording = { recorder: null, state: INITIAL_ROBOT, texts: new Map(), saving: Promise.resolve() };

    recordings.set(name, rec);

    return rec;
  };
}

export function recordedLink(link: RobotLinkApi): RobotLinkApi {
  const recordingOf = recordingsOf();

  return {
    ...link,
    onRobotEvent: (callback) =>
      link.onRobotEvent?.((event) => observe(recordingOf(unitOfEvent(event)), event, callback)) ?? (() => {}),
    robotCommand: async (command, unit) => {
      const reply = (await link.robotCommand?.(command, unit)) ?? { ok: false, message: '' };
      const rec = recordingOf(unit);

      if (reply.ok && command.cmd === 'intent' && rec.state.status?.run === 'running')
        rec.recorder?.intent(command.joints as number[]);

      return reply;
    },
    robotRecord: async (sample, unit) => {
      const rec = recordingOf(unit);

      if ('scene' in sample) rec.recorder?.setContext(sample.scene);
      else rec.recorder?.sample(sample);

      return { ok: true };
    },
  };
}
