import { operatorCameraSnapshot, subscribeOperatorCamera } from '../cameras/operator/operatorCamera';
import { closeTryVideo } from '../cases/tryStore';
import type { RobotEvent } from './robotState';
import { subscribeRobotEvents } from './robotStore';
import type { VideoRecorder } from './takeVideoProtocol';
import { workerRecorder } from './takeVideoRecorder';

export type { VideoRecorder } from './takeVideoProtocol';

export interface TakeVideoOptions {
  record: (id: string, stream: MediaStream, lead: number) => VideoRecorder;
  close: (id: string, keep: boolean) => Promise<void>;
  now?: () => number;
}

export interface TakeVideo {
  event: (event: RobotEvent) => void;
  camera: (stream: MediaStream | null) => void;
}

interface Take {
  openedAt: number;
  recorder: VideoRecorder | null;
  video: Promise<boolean> | null;
  expiry: ReturnType<typeof setTimeout> | null;
}

export const PENDING_TAKES = 4;
export const KEPT_GRACE_MS = 30_000;
export const MIN_LEAD_S = 0.05;

const leadOf = (ms: number) => (ms / 1000 < MIN_LEAD_S ? 0 : ms / 1000);

export function createTakeVideo({ record, close, now = () => performance.now() }: TakeVideoOptions): TakeVideo {
  const takes = new Map<string, Take>();
  let open: string | null = null;
  let stream: MediaStream | null = null;

  const openTake = () => (open === null ? undefined : takes.get(open));

  const begin = (id: string, take: Take) => {
    if (stream && !take.recorder && !take.video) take.recorder = record(id, stream, leadOf(now() - take.openedAt));
  };

  const end = (take: Take) => {
    if (!take.recorder) return;

    take.video = take.recorder.finish();
    take.recorder = null;
  };

  const forget = (id: string) => {
    const take = takes.get(id);

    takes.delete(id);

    if (take?.expiry) clearTimeout(take.expiry);

    if (open === id) open = null;

    return take;
  };

  const discard = (id: string) => {
    const take = forget(id);
    const settled = take?.recorder ? take.recorder.drop() : take?.video;

    if (settled) void settled.then(() => close(id, false)).catch(() => undefined);
  };

  const kept = async (id: string) => {
    const take = takes.get(id);

    if (!take) return;

    end(take);
    forget(id);

    if (take.video) await close(id, await take.video);
  };

  const opened = (id: string) => {
    const current = openTake();

    if (current) end(current);

    discard(id);
    [...takes.keys()].slice(0, Math.max(0, takes.size + 1 - PENDING_TAKES)).forEach(discard);

    const take: Take = { openedAt: now(), recorder: null, video: null, expiry: null };

    takes.set(id, take);
    open = id;
    begin(id, take);
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

      if (!take || open === null) return;

      if (next) begin(open, take);
      else end(take);
    },
  };
}

let started = false;

export function startTakeVideo() {
  if (started) return;

  started = true;

  const takes = createTakeVideo({ record: workerRecorder, close: closeTryVideo });
  const watchCamera = () => {
    const { open, stream } = operatorCameraSnapshot();

    takes.camera(open ? stream : null);
  };

  subscribeRobotEvents(takes.event);
  subscribeOperatorCamera(watchCamera);
  watchCamera();
}
