import { rigForWorker } from '../../sim/drive';
import type { DriveCommand } from '../../sim/driveTypes';
import type { InputRobot, InputSource } from '../../sim/inputSources';
import { robotRig } from '../../utils/kinematics';
import { framePump, type FramePump } from './cameraFrames';
import type { LandmarkRow } from './landmarks';
import type { OperatorTarget } from './operatorDriver';
import type { OperatorRequest, OperatorResponse } from './operatorProtocol';
import { setOperatorState } from './operatorStore';
import { tabulatePoints } from './pointTable';

interface Session {
  stream: MediaStream;
  worker: Worker;
  pump: FramePump;
  latest: DriveCommand | null;
  latencies: number[];
  estimator: boolean | null;
  detectMs: number | null;
  fps: number | null;
  estimatorError: string | null;
}

const LATENCY_SAMPLES = 300;
const VIDEO: MediaTrackConstraints = { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } };

const REFUSED = 'Camera access is off in System Settings.';

let session: Session | null = null;
let generation = 0;
let lastTracks: MediaStreamTrack[] = [];
const canvases = new WeakSet<HTMLCanvasElement>();

function targetFor({ setup, rig, pointOf }: InputRobot): OperatorTarget | null {
  if (setup?.kind === 'arm') return { kind: 'arm', anchor: setup.anchor, reachMm: setup.reachMm };

  if (setup?.kind !== 'pose') return null;

  const own = robotRig(rig, setup.robot);
  const body = own.joints.length ? own : rig;
  const jaws = new Set(setup.jaws?.map((j) => j.joint));

  return {
    kind: 'pose',
    rig: rigForWorker(body),
    points: tabulatePoints(body, pointOf),
    joints: setup.joints.filter((j) => !jaws.has(j.id)).map((j) => j.id),
  };
}

const post = (msg: OperatorRequest, transfer: Transferable[] = []) => session?.worker.postMessage(msg, transfer);

function heard(s: Session, msg: OperatorResponse, changed: () => void) {
  if (msg.type === 'estimator') {
    s.estimator = msg.ready;
    s.estimatorError = msg.message ?? null;

    return;
  }

  if (msg.type === 'timing') {
    s.detectMs = msg.detectMs;
    s.fps = msg.fps;

    return;
  }

  s.latest = msg.command;
  changed();
  s.latencies.push(performance.timeOrigin + performance.now() - msg.at);

  if (s.latencies.length > LATENCY_SAMPLES) s.latencies.shift();
}

function begin(stream: MediaStream, target: OperatorTarget, changed: () => void) {
  const worker = new Worker(new URL('./operator.worker.ts', import.meta.url), { type: 'module' });
  const pump = framePump(stream, worker);
  const s: Session = {
    stream,
    worker,
    pump,
    latest: null,
    latencies: [],
    estimator: null,
    detectMs: null,
    fps: null,
    estimatorError: null,
  };

  session = s;
  lastTracks = stream.getTracks();
  worker.onmessage = (e: MessageEvent<OperatorResponse>) => heard(s, e.data, changed);
  post({ type: 'start', target, frames: pump.start, estimate: true }, pump.start ? [pump.start] : []);
  setOperatorState({ on: true, label: stream.getVideoTracks()[0]?.label ?? '' });
}

class Superseded extends Error {}

async function openStream(mine: number) {
  if ((await window.electronAPI?.askCameraAccess?.()) === false) throw new Error(REFUSED);

  if (mine !== generation) throw new Superseded();

  const stream = await navigator.mediaDevices.getUserMedia({ video: VIDEO, audio: false });

  if (mine === generation) return stream;

  stream.getTracks().forEach((t) => t.stop());

  throw new Superseded();
}

async function open(robot: InputRobot) {
  close();

  const mine = generation;
  const target = targetFor(robot);

  if (!target) return;

  let stream: MediaStream | null = null;

  try {
    stream = await openStream(mine);
    begin(stream, target, robot.changed);
  } catch (err) {
    stream?.getTracks().forEach((t) => t.stop());

    if (err instanceof Superseded || mine !== generation) throw err;

    close();
    setOperatorState({ failure: { message: err instanceof Error ? err.message : String(err), at: Date.now() } });

    throw err;
  }
}

function close() {
  generation++;

  const s = session;

  if (!s) return;

  session = null;
  s.pump.stop();
  s.stream.getTracks().forEach((t) => t.stop());
  s.worker.postMessage({ type: 'stop' } satisfies OperatorRequest);
  s.worker.terminate();
  setOperatorState({ on: false, label: '' });
}

export const cameraInput: InputSource = {
  id: 'camera',
  body: true,
  read: () => session?.latest ?? null,
  open,
  close,
};

export function attachOperatorCanvas(canvas: HTMLCanvasElement | null) {
  if (!canvas || !session || canvases.has(canvas)) return;

  canvases.add(canvas);

  const offscreen = canvas.transferControlToOffscreen();

  post({ type: 'canvas', canvas: offscreen, mirror: true }, [offscreen]);
}

export function feedLandmarks(frames: LandmarkRow[][], fps: number) {
  post({ type: 'landmarks', frames, fps });
}

const median = (xs: number[]) => {
  const sorted = [...xs].sort((a, b) => a - b);

  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
};

export function operatorCameraState() {
  return {
    on: !!session,
    estimator: session?.estimator ?? null,
    detectMs: session?.detectMs ?? null,
    fps: session?.fps ?? null,
    estimatorError: session?.estimatorError ?? null,
    tracks: lastTracks.map((t) => ({ kind: t.kind, label: t.label, state: t.readyState })),
    commands: session?.latencies.length ?? 0,
    latencyMs: session ? median(session.latencies) : null,
  };
}
