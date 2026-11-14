import { operatorCameraSnapshot, subscribeOperatorCamera } from '../cameras/operator/operatorCamera';
import { saveTryVideo } from '../cases/tryStore';
import type { RobotEvent } from './robotState';
import { subscribeRobotEvents } from './robotStore';
import type { VideoRecorder } from './takeVideoProtocol';
import { workerRecorder } from './takeVideoRecorder';

export type { VideoRecorder } from './takeVideoProtocol';

export interface TakeVideoOptions {
  record: (stream: MediaStream) => VideoRecorder;
  keep: (id: string, bytes: Uint8Array) => Promise<void>;
}

export interface TakeVideo {
  event: (event: RobotEvent) => void;
  camera: (stream: MediaStream | null) => void;
}

interface Take {
  recorder: VideoRecorder | null;
  video: Promise<Uint8Array | null> | null;
  expiry: ReturnType<typeof setTimeout> | null;
}

export const PENDING_TAKES = 4;
export const KEPT_GRACE_MS = 30_000;

export function createTakeVideo({ record, keep }: TakeVideoOptions): TakeVideo {
  const takes = new Map<string, Take>();
  let open: string | null = null;
  let stream: MediaStream | null = null;

  const openTake = () => (open === null ? undefined : takes.get(open));

  const begin = (take: Take) => {
    if (stream && !take.recorder && !take.video) take.recorder = record(stream);
  };

  const end = (take: Take) => {
    if (!take.recorder) return;

    take.video = take.recorder.finish();
    take.recorder = null;
  };

  const discard = (id: string) => {
    const take = takes.get(id);

    takes.delete(id);
    take?.recorder?.drop();

    if (take?.expiry) clearTimeout(take.expiry);

    if (open === id) open = null;
  };

  const kept = async (id: string) => {
    const take = takes.get(id);

    if (!take) return;

    end(take);
    discard(id);

    const bytes = await take.video;

    if (bytes?.byteLength) await keep(id, bytes);
  };

  const opened = (id: string) => {
    const current = openTake();

    if (current) end(current);

    discard(id);
    [...takes.keys()].slice(0, Math.max(0, takes.size + 1 - PENDING_TAKES)).forEach(discard);

    const take: Take = { recorder: null, video: null, expiry: null };

    takes.set(id, take);
    open = id;
    begin(take);
  };

  const linkLost = () => {
    const current = openTake();

    if (current) end(current);

    open = null;

    for (const [id, take] of takes) take.expiry ??= setTimeout(() => discard(id), KEPT_GRACE_MS);
  };

  const steps = new Map<unknown, (id: string) => void>([
    ['open', opened],
    ['kept', (id) => void kept(id).catch(() => undefined)],
    ['dropped', discard],
  ]);

  return {
    event: (event) => {
      if (event.event === 'link' && event.state !== 'connected') return linkLost();

      const { id, state } = event;

      if (event.event === 'take' && typeof id === 'string') steps.get(state)?.(id);
    },
    camera: (next) => {
      if (next === stream) return;

      stream = next;

      const take = openTake();

      if (!take) return;

      if (next) begin(take);
      else end(take);
    },
  };
}

let started = false;

export function startTakeVideo() {
  if (started) return;

  started = true;

  const takes = createTakeVideo({ record: workerRecorder, keep: saveTryVideo });
  const watchCamera = () => {
    const { open, stream } = operatorCameraSnapshot();

    takes.camera(open ? stream : null);
  };

  subscribeRobotEvents(takes.event);
  subscribeOperatorCamera(watchCamera);
  watchCamera();
}
