import type { RefObject } from 'react';
import { loadManifests } from '../cases/tryStore';
import type { StoredTry } from '../cases/tryFile';
import type { TryRecord } from '../cases/tries';
import { replayOfEvaluation } from '../cases/evaluationReplayValidation';
import type { SeedReplay } from '../cases/seedReplay';
import { readTimelineSource, timelineSourceCurrent, type TimelineSource } from './tryTimelineSource';
import {
  prepareOpening,
  timelineOrigin,
  type Opened,
  type TimelineOptions,
  type TimelineOrigin,
} from './tryTimelineOpening';

export interface PendingTimeline {
  origin: TimelineOrigin;
  current: () => boolean;
}

interface ShowContext {
  options: TimelineOptions;
  opened: Opened | null;
  opening: RefObject<number>;
  pending: RefObject<PendingTimeline | null>;
  saved: { close: () => void; show: (ids: readonly string[], at?: number) => Promise<boolean> };
  setOpened: (opened: Opened) => void;
  reset: (at: number, frames: number) => void;
  openRecordedCameras: (stored: StoredTry | null) => void;
}

async function isTopicTry(record: TryRecord) {
  if (record.manifest.modelHash) return false;

  const stored = (await loadManifests([record.id]))[0];

  return stored?.source === 'import' && stored.robot.joints.length === 0;
}

export async function showTimeline(
  context: ShowContext,
  {
    record,
    at,
    seeded,
    source = () => true,
  }: { record: TryRecord; at?: number; seeded?: SeedReplay; source?: TimelineSource },
) {
  const { options, opened, opening, pending, saved, setOpened, reset, openRecordedCameras } = context;
  const current = timelineSourceCurrent(source);
  const previous = pending.current?.current() ? pending.current.origin : opened;
  const ticket = ++opening.current;
  const valid = () => ticket === opening.current && current();

  saved.close();

  const topicOnly = await isTopicTry(record);

  if (!valid()) return false;

  if (topicOnly) return saved.show([record.id], at);

  const [recording, manifests] = await readTimelineSource(record.id, seeded, source);

  if (!recording || !valid()) return false;

  if (!(await ensureScene(options, { record, recording }))) return false;

  if (!valid()) return false;

  const replay = replayOfEvaluation(recording) ?? seeded;
  const origin = timelineOrigin(options.sim, replay, previous);

  pending.current = { origin, current: valid };

  const prepared = await prepareOpening(options, record, recording, {
    seeded: replay,
    previous: origin,
    current: valid,
  });

  if (!prepared || !valid()) return false;

  openRecordedCameras(manifests[0] ?? null);
  setOpened(prepared);
  reset(initialFrame(at, prepared), recording.frames);

  return true;
}

const ensureScene = (
  options: TimelineOptions,
  input: { record: TryRecord; recording: import('../sim/recorder').Recording },
) => options.ensureEvaluationScene?.(input) ?? Promise.resolve(true);
const initialFrame = (at: number | undefined, opened: Opened) => at ?? opened.trips[0]?.frame ?? 0;
