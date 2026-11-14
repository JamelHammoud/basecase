import { consoleTrack } from '../cases/console/consoleTrack';
import { DEFAULT_CONSOLE } from '../cases/console/layout';
import { rounded, tryAsk, tryReading, type TryReading } from '../cases/console/tryReading';
import { workerJudge } from '../cases/goalJudge';
import { readCases, type Case } from '../cases/schema';
import type { TryRecord } from '../cases/tries';
import { loadRecording } from '../cases/tryStore';
import type { Viewport3DHandle } from '../components/Viewport3D';
import type { Simulation } from '../sim/useSimulation';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import type { Rig } from '../utils/kinematics';
import type { Cases } from './useCases';

type Payload = Record<string, unknown>;

export interface LiveScene {
  cases: Pick<Cases, 'active' | 'timeline'>;
  sim: Pick<Simulation, 'modelNow' | 'sought'>;
  rig: Rig;
}

export interface ReadTryContext {
  cases: Pick<Cases, 'active' | 'open'>;
  live: () => LiveScene;
  parts: () => ScenePart[];
  project: () => ProjectSettings;
  viewport: () => Viewport3DHandle | null;
  setAction: (action: string) => void;
}

const WAIT_MS = 5000;
const POLL_MS = 20;
const LISTED_TRIES = 12;
const CAPTURE_SIDE = 1024;
const CAPTURE_VIEWS = /^(iso|front|side|top|back|az:-?\d+(\.\d+)?,el:-?\d+(\.\d+)?)$/;

const pause = () => new Promise((resolve) => setTimeout(resolve, POLL_MS));

async function until<T>(read: () => T | null): Promise<T | null> {
  const end = performance.now() + WAIT_MS;

  while (performance.now() < end) {
    const got = read();

    if (got) return got;

    await pause();
  }

  return read();
}

const newestFirst = (tries: TryRecord[]) => [...tries].sort((a, b) => b.at.localeCompare(a.at));

function triesLine(tries: TryRecord[], kase: Case | null) {
  if (!kase) return 'No Case is open; name a try id, or open its Case.';

  const ids = newestFirst(tries.filter((t) => t.caseId === kase.id)).slice(0, LISTED_TRIES);

  return ids.length ? `Tries of ${kase.name}: ${ids.map((t) => t.id).join(', ')}.` : `${kase.name} has no tries.`;
}

export function pickTry(payload: Payload, tries: TryRecord[], active: Case | null): TryRecord | string {
  const wanted = typeof payload.id === 'string' && payload.id.trim() ? payload.id.trim() : null;

  if (wanted)
    return tries.find((t) => t.id === wanted) ?? `No try ${wanted} in this scene. ${triesLine(tries, active)}`;

  if (!active) return 'No Case is open. Name the try’s id.';

  const [record] = newestFirst(tries.filter((t) => t.caseId === active.id && !t.real));

  return record ?? `${active.name} has no simulated tries to read. Try it first.`;
}

async function openCase(kase: Case, ctx: ReadTryContext): Promise<string | null> {
  if (ctx.cases.active?.id === kase.id) return null;

  ctx.cases.open(kase.id);

  const opened = await until(() => ctx.live().cases.active?.id === kase.id || null);

  return opened ? null : `Its Case ${kase.name} didn’t open. Open it and call read_try again.`;
}

async function openTry(record: TryRecord, ctx: ReadTryContext) {
  await ctx.live().cases.timeline.show(record);

  return until(() => {
    const timeline = ctx.live().cases.timeline;

    return timeline.record?.id === record.id && timeline.recording ? timeline : null;
  });
}

async function capture(reading: TryReading, frame: number, view: string, ctx: ReadTryContext) {
  const viewport = ctx.viewport();

  ctx.live().cases.timeline.seek(frame);

  const landed = await until(() => ctx.live().sim.sought()?.frame === frame || null);

  if (!viewport || !landed) return [];

  const shots = await viewport.captureViews([view], undefined, { maxSide: CAPTURE_SIDE });

  return shots.map((shot) => ({ view: `${shot.view} at ${reading.capture} s`, dataUrl: shot.dataUrl }));
}

async function recordedTry(record: TryRecord, kase: Case, ctx: ReadTryContext) {
  const unopened = await openCase(kase, ctx);

  if (unopened) return unopened;

  if (!(await loadRecording(record.id))) return `No recording of try ${record.id} is saved.`;

  const timeline = await openTry(record, ctx);
  const model = ctx.live().sim.modelNow();

  if (!timeline?.recording || !model)
    return `Try ${record.id}’s recording doesn’t fit the robot as it is now: the design changed since it ran.`;

  const track = await consoleTrack({
    kase,
    model,
    rig: ctx.live().rig,
    parts: ctx.parts(),
    recording: timeline.recording,
    efforts: timeline.efforts,
    caseConsole: kase.console ?? DEFAULT_CONSOLE,
    cameras: [],
    judge: workerJudge,
  });

  return { track, trips: timeline.trips };
}

export async function readTry(payload: Payload, ctx: ReadTryContext) {
  const project = ctx.project();
  const record = pickTry(payload, project.tries ?? [], ctx.cases.active);

  if (typeof record === 'string') return { ok: false, problem: record };

  if (record.real)
    return { ok: false, problem: `Try ${record.id} ran on the real robot, so it has no recording to read.` };

  const kase = readCases(project.cases).find((c) => c.id === record.caseId);

  if (!kase) return { ok: false, problem: `Try ${record.id}’s Case is no longer in this scene.` };

  ctx.setAction('Reading a try');

  const read = await recordedTry(record, kase, ctx);

  if (typeof read === 'string') return { ok: false, problem: read };

  const reading = tryReading(read.track, read.trips, tryAsk(payload));
  const view = typeof payload.view === 'string' && CAPTURE_VIEWS.test(payload.view) ? payload.view : 'iso';
  const images = await capture(reading, read.track.frameAt(reading.capture), view, ctx);
  const head = {
    id: record.id,
    case: kase.name,
    passed: record.passed,
    margin: rounded(record.margin),
    seconds: rounded(record.seconds, 2),
  };

  return { text: JSON.stringify({ ok: true, try: head, ...reading }), images };
}
