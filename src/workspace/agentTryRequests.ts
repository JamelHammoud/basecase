import { DEFAULT_CONSOLE } from '../cases/console/layout';
import {
  frameAtTime,
  goalVerdicts,
  recordedTrack,
  type SignalTrack,
  type Verdict,
} from '../cases/console/recordedSignals';
import { captureTime, tryReading } from '../cases/console/tryReading';
import { workerJudge } from '../cases/goalJudge';
import type { Case } from '../cases/schema';
import { summaryRecord, type TrySummary } from '../cases/tryFile';
import type { TryRecord } from '../cases/tries';
import { loadTries } from '../cases/tryStore';
import type { SimModel } from '../sim/mjcfTypes';
import type { Viewport3DHandle } from '../three/viewport/types';
import type { ProjectSettings } from '../types/robotics';
import type { Rig } from '../utils/kinematics';
import { timelineScene } from './useRecordedSignals';
import type { TryTimeline } from './useTryTimeline';

type Payload = Record<string, unknown>;

export interface TryReadSources {
  timeline: () => TryTimeline;
  model: () => SimModel | null;
  rig: () => Rig;
  sought: () => { frame: number } | null;
}

export interface TryReadContext {
  project: () => ProjectSettings;
  viewport: () => Pick<Viewport3DHandle, 'captureViews'> | null;
  setAction: (action: string) => void;
  cases: { cases: Case[] };
  tryRead: TryReadSources;
  listTries?: () => Promise<TrySummary[]>;
}

interface Found {
  record: TryRecord;
  caseName: string | null;
}

interface Held {
  open: boolean;
  record: TryRecord | null;
  frame: number;
}

const CAPTURE_SIDE = 1024;
const POLL_MS = 50;
const WAIT_MS = 10_000;
const SETTLE_MS = 100;
const LISTED_TRIES = 5;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(test: () => boolean, ms = WAIT_MS) {
  for (let waited = 0; waited < ms; waited += POLL_MS) {
    if (test()) return true;

    await sleep(POLL_MS);
  }

  return test();
}

const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

const strings = (v: unknown) => (Array.isArray(v) ? v.flatMap((s) => text(s) ?? []) : undefined);

const latestFirst = (records: TryRecord[]) => [...records].sort((a, b) => b.at.localeCompare(a.at));

function recentTries(own: TryRecord[], cases: Case[]) {
  const listed = latestFirst(own)
    .slice(0, LISTED_TRIES)
    .map((t) => {
      const kase = cases.find((c) => c.id === t.caseId)?.name ?? t.caseId;

      return `${t.id} (${kase}, ${t.passed ? 'passed' : 'failed'}, ${t.at})`;
    });

  return listed.length ? `This scene’s latest tries: ${listed.join('; ')}.` : 'This scene has no tries.';
}

const wantedId = (payload: Payload, ctx: TryReadContext, own: TryRecord[]) =>
  text(payload.id) ?? ctx.tryRead.timeline().record?.id ?? latestFirst(own)[0]?.id;

function refusal(record: TryRecord, summary: TrySummary | undefined) {
  if (record.real) return `${record.id} ran on the real robot; read_try reads tries run in simulation.`;

  return summary && !summary.recording ? `${record.id} kept no recording.` : null;
}

async function findTry(payload: Payload, ctx: TryReadContext): Promise<Found | string> {
  const own = ctx.project().tries ?? [];
  const id = wantedId(payload, ctx, own);

  if (!id) return 'This scene has no tries. The user records one with Try It.';

  const summary = (await (ctx.listTries ?? loadTries)()).find((t) => t.id === id);
  const record = own.find((t) => t.id === id) ?? (summary ? summaryRecord(summary) : null);

  if (!record) return `No try ${id}. ${recentTries(own, ctx.cases.cases)}`;

  const refused = refusal(record, summary);

  if (refused) return refused;

  const kase = ctx.cases.cases.find((c) => c.id === record.caseId);

  return { record, caseName: kase?.name ?? summary?.caseName ?? null };
}

async function openTry(record: TryRecord, sources: TryReadSources): Promise<TryTimeline | null> {
  const now = sources.timeline();
  const shown = (now.open && now.record?.id === record.id) || (await now.show(record));
  const ready = () => sources.timeline().record?.id === record.id && !!sources.timeline().recording;

  return shown && (await until(ready)) ? sources.timeline() : null;
}

async function verdictsOf(timeline: TryTimeline): Promise<Verdict[]> {
  const contract = timeline.scene?.scoring.kase.task.contract;
  const trace = timeline.scene?.trace;

  if (!contract || !trace) return [];

  return goalVerdicts(workerJudge(contract), trace).catch(() => []);
}

const consoleOf = (kase: Case | undefined) => {
  const { input, signals } = kase?.console ?? DEFAULT_CONSOLE;

  return { inputs: input, signals, cameras: [] };
};

async function captureAt(track: SignalTrack, at: number, ctx: TryReadContext) {
  const frame = frameAtTime(track, at);

  ctx.tryRead.timeline().seek(frame);

  if (!(await until(() => ctx.tryRead.sought()?.frame === frame))) return [];

  await sleep(SETTLE_MS);

  const shots = (await ctx.viewport()?.captureViews(['iso'], undefined, { maxSide: CAPTURE_SIDE })) ?? [];

  return shots.map((shot) => ({ view: `The try at ${track.t[frame].toFixed(2)} s`, dataUrl: shot.dataUrl }));
}

async function readOpened({ record, caseName }: Found, payload: Payload, ctx: TryReadContext) {
  const sources = ctx.tryRead;
  const timeline = await openTry(record, sources);
  const scene = timeline && timelineScene({ timeline, model: sources.model(), rig: sources.rig() });

  if (!timeline?.recording || !scene)
    return { ok: false, problem: `${record.id}’s recording is missing or doesn’t fit this robot as it is now.` };

  const kase = ctx.cases.cases.find((c) => c.id === record.caseId);
  const track = recordedTrack({ ...scene, verdicts: await verdictsOf(timeline) }, consoleOf(kase));
  const reading = tryReading({
    track,
    trips: timeline.trips,
    dt: timeline.recording.dt,
    from: num(payload.from),
    to: num(payload.to),
    signals: strings(payload.signals),
  });
  const at = captureTime(reading, num(payload.at));

  return {
    ok: true,
    try: record.id,
    case: caseName,
    ...reading,
    captured: at,
    images: await captureAt(track, at, ctx),
  };
}

const heldOf = (timeline: TryTimeline): Held => ({
  open: timeline.open,
  record: timeline.record,
  frame: timeline.frame,
});

async function putBack(before: Held, id: string, sources: TryReadSources) {
  const now = sources.timeline();

  if (!before.open || !before.record) {
    now.close();

    return;
  }

  if (before.record.id === id) {
    now.seek(before.frame);

    return;
  }

  await now.show(before.record, before.frame);
}

export async function readTry(payload: Payload, ctx: TryReadContext) {
  const found = await findTry(payload, ctx);

  if (typeof found === 'string') return { ok: false, problem: found };

  ctx.setAction('Reading a try');

  const before = heldOf(ctx.tryRead.timeline());

  try {
    return await readOpened(found, payload, ctx);
  } finally {
    await putBack(before, found.record.id, ctx.tryRead);
  }
}

export const TRY_HANDLERS = {
  read_try: (payload: Payload, ctx: TryReadContext) => readTry(payload, ctx),
};
