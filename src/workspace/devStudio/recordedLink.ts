import { OperateRecorder } from '../../../electron/robot/operateRecorder.mjs';
import { BenchControl } from '../../../electron/robot/benchControl.mjs';
import { readStoredTry } from '../../cases/tryFile';
import { keepSession } from '../../cases/tryStore';
import { DEFAULT_UNIT } from '../../../electron/robot/units.mjs';
import type { RobotLinkApi } from '../../robot/robotStore';
import { unitOfEvent } from '../../robot/robotUnits';
import { applyRobotEvent, INITIAL_ROBOT, type RobotEvent, type RobotState } from '../../robot/robotState';
import { statusPositions } from '../../robot/runBuffer';

type Listener = (event: RobotEvent) => void;

interface Recording {
  control?: BenchControl;
  session?: Record<string, unknown>;
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

async function deliver(link: RobotLinkApi, rec: Recording, command: Record<string, unknown>, unit?: string) {
  const recorder = rec.recorder;
  const reply = (await link.robotCommand?.(command, unit)) ?? { ok: false, message: '' };

  if (reply.ok && command.cmd === 'intent' && rec.state.status?.run === 'running')
    recorder?.intent(command.joints as number[]);

  return reply;
}

function observe(rec: Recording, event: RobotEvent, forward: Listener, link: RobotLinkApi) {
  const closing = event.event === 'link' && event.state !== 'connected';

  if (closing) {
    rec.control?.revoke(false, 'disconnect');
    rec.recorder?.close('disconnect');
  }

  rec.state = applyRobotEvent(rec.state, event);

  if (event.event === 'link' && event.state === 'connected') {
    rec.recorder = recorderFor(rec, event, forward);
    rec.session = {
      spec: rec.state.spec,
      recorder: rec.recorder,
      pipe: {
        idle: () => {},
        hold: (value: { joints: number[] }) =>
          void deliver(link, rec, { cmd: 'intent', joints: value.joints }, unitOfEvent(event)),
        write: (command: Record<string, unknown>) => void deliver(link, rec, command, unitOfEvent(event)),
      },
    };
    rec.control = new BenchControl({
      session: rec.session,
      emit: (controlEvent) => {
        const announce = () => forward({ ...controlEvent, unit: unitOfEvent(event) });

        if (controlEvent.held === false) void rec.saving.then(announce);
        else announce();
      },
      clock: () => Date.now(),
    });
  }

  Object.assign(rec.session ?? {}, {
    mode: rec.state.mode,
    status: rec.state.status,
    hello: { emulated: rec.state.emulated },
    calibration: { joints: rec.state.calibration, class: rec.state.spec?.class },
    heardAt: Date.now(),
  });
  rec.recorder?.event(event);

  if (event.event === 'fault') rec.control?.revoke(false, 'fault');

  forward({ ...event, context: rec.recorder?.incidentContext() });

  if (closing) rec.recorder = null;
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
      link.onRobotEvent?.((event) => observe(recordingOf(unitOfEvent(event)), event, callback, link)) ?? (() => {}),
    robotCommand: async (command, unit) => {
      const rec = recordingOf(unit);
      const checked = rec.control?.command(command);

      if (checked && !('command' in checked)) return checked;

      return deliver(link, rec, checked?.command ?? command, unit);
    },
    robotState: async (unit) => {
      const state = await link.robotState?.(unit);
      const rec = recordingOf(unit);

      return {
        ...(state ?? { connected: false, spec: null, hello: null, status: null }),
        connected: rec.state.link === 'connected',
        spec: rec.state.spec,
        calibration: rec.state.calibration,
        control: rec.control?.snapshot(),
      };
    },
    robotRecord: async (sample, unit) => {
      const rec = recordingOf(unit);

      if ('scene' in sample) rec.recorder?.setContext(sample.scene);
      else rec.recorder?.sample(sample);

      return { ok: true };
    },
  };
}
