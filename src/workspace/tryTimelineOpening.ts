import { caseWorldItems } from '../cases/importedWorldItems';
import type { SimModel } from '../sim/mjcfTypes';
import { stageCase, stagedEffectors } from '../cases/caseCast';
import type { Case } from '../cases/schema';
import type { SlotRobot } from '../cases/slots';
import { trySignals, type TryRecord, type TryScoring } from '../cases/tries';
import { tripFrames, type Trip } from '../cases/tripFrames';
import type { RecordedEfforts } from '../sim/recordedFrames';
import type { SeedReplay } from '../cases/seedReplay';
import type { Recording } from '../sim/recorder';
import type { Simulation } from '../sim/useSimulation';
import { withoutTopics } from '../topics/recordingTopics';
import type { Trace } from '../skills/contract';
import type { ScenePart } from '../types/robotics';
import type { Rig } from '../utils/kinematics';

export interface TimelineOptions {
  sim: Simulation;
  rig: Rig;
  parts: ScenePart[];
  cases: Case[];
  partners: () => SlotRobot[];
}

export interface TryScene {
  kase: Case;
  scoring: Omit<TryScoring, 'recording'>;
  trace: Trace;
}

export interface TimelineOrigin {
  before: 'off' | 'paused' | 'playing';
  restore?: SeedWorld;
}

export interface Opened extends TimelineOrigin {
  record: TryRecord;
  recording: Recording;
  efforts: RecordedEfforts;
  trips: Trip[];
  scene: TryScene | null;
}

function sceneOf(options: TimelineOptions, record: TryRecord, recording: Recording): TryScene | null {
  const { sim, rig, parts, cases, partners } = options;
  const model = sim.modelNow();
  const kase = cases.find((c) => c.id === record.caseId);

  if (!kase || !model) return null;

  const staged = stageCase(kase, { rig, parts }, partners());
  const scoring = { kase: staged.kase, model, ...stagedEffectors(staged, { rig, parts }) };

  return { kase, scoring, trace: trySignals({ ...scoring, recording }) };
}

const tripsOf = (scene: TryScene | null): Promise<Trip[]> =>
  scene ? tripFrames(scene.scoring.kase.task.contract, scene.trace).catch(() => []) : Promise.resolve([]);

function simBefore(sim: Simulation): Opened['before'] {
  if (sim.status === 'off') return 'off';

  return sim.playing ? 'playing' : 'paused';
}

interface SeedWorld {
  world: ReturnType<Simulation['worldNow']>;
  model: SimModel | null;
}

export function restoreSeedWorld(sim: Simulation, opened: TimelineOrigin) {
  const saved = opened.restore;

  if (!saved) return;

  sim.setWorld(saved.world.items, saved.world.guests);

  if (opened.before === 'off') return;

  void sim.start(saved.model ?? undefined).then(() => {
    if (opened.before === 'paused' && sim.modelNow() === saved.model) sim.pause();
  });
}

export function timelineOrigin(
  sim: Simulation,
  seeded: SeedReplay | undefined,
  previous: TimelineOrigin | null,
): TimelineOrigin {
  return {
    before: previous?.before ?? simBefore(sim),
    restore: previous?.restore ?? (seeded ? { world: sim.worldNow(), model: sim.modelNow() } : undefined),
  };
}

async function startOpening(sim: Simulation, seeded: SeedReplay | undefined, restore: SeedWorld | undefined) {
  if (sim.drive.active) sim.drive.stop();

  if (seeded) sim.setWorld(caseWorldItems(seeded.kase));

  if (!seeded && restore) sim.setWorld(restore.world.items, restore.world.guests);

  if (seeded || !sim.modelNow()) await sim.start(seeded?.model ?? restore?.model ?? undefined);
}

function replayScene(staged: TryScene | null, seeded: SeedReplay | undefined): TryScene | null {
  if (!seeded || !staged) return staged;

  return {
    kase: staged.kase,
    scoring: { ...staged.scoring, kase: seeded.kase, model: seeded.model },
    trace: seeded.trace,
  };
}

export async function prepareOpening(
  options: TimelineOptions,
  record: TryRecord,
  recording: Recording,
  context: { seeded?: SeedReplay; previous: TimelineOrigin | null; current?: () => boolean },
): Promise<Opened | null> {
  const { sim } = options;
  const { seeded, previous } = context;
  const current = context.current ?? (() => true);
  const { before, restore } = timelineOrigin(sim, seeded, previous);

  await startOpening(sim, seeded, restore);

  if (!current()) return null;

  const efforts = await sim.scrub(withoutTopics(recording), seeded?.efforts);

  if (!efforts || !current()) return null;

  const scene = replayScene(sceneOf(options, record, recording), seeded);
  const trips = seeded?.trips ?? (await tripsOf(scene));

  return { record, recording, efforts, trips, scene, before, restore };
}
