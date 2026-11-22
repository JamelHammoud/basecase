import { localBuilds, type BuildRecord } from '../kit/buildRecords';
import { currentBuildRepair } from '../kit/buildRepairState';
import { frozenViewParts } from '../kit/frozenView';
import { buildAlongSteps } from '../guide/buildAlong';
import { frozenRepairPlayback } from './frozenRepairPlayback';
import { stepView, type Session } from './buildAlongSession';
import type { ViewShot } from '../three/viewport/types';

function repairView(state: NonNullable<Session['repairSession']>, index: number) {
  return state.revisions[index] === 'target' || (state.record.state === 'complete' && state.record.count === 0)
    ? { kit: state.target, parts: state.targetParts }
    : { kit: state.source, parts: state.sourceParts };
}

export async function frozenBuildSession(id: string, camera: ViewShot | undefined, history?: string): Promise<Session> {
  const frozen = await localBuilds.open(id);
  const { record } = frozen;
  const kit = history === 'original' ? await localBuilds.openRevision(id, record.kit) : frozen.kit;
  const repair =
    history === 'original'
      ? undefined
      : (record.repairs?.find((item) => item.id === history) ?? record.repairs?.at(-1));

  if (repair) return repairSession(record, repair, camera, frozen);

  const nets = kit.manifest.wiring;
  const steps = buildAlongSteps(kit.manifest.guide, kit.project.joints ?? [], [
    ...(nets?.buses.flatMap((bus) => bus.nets) ?? []),
    ...(nets?.power.nets ?? []),
  ]);

  return {
    steps,
    views: steps.map(stepView),
    stepParts: kit.manifest.guide.steps.map((step) => step.partIds),
    index: Math.min(record.index, steps.length - 1),
    camera,
    frozen: { record, kit, parts: frozenViewParts(kit) },
  };
}

async function repairSession(
  record: BuildRecord,
  repair: NonNullable<BuildRecord['repairs']>[number],
  camera: ViewShot | undefined,
  frozen: Awaited<ReturnType<typeof localBuilds.open>>,
): Promise<Session> {
  const currentHash = record.configuration ?? record.kit;
  const source = currentHash === repair.source ? frozen.kit : await localBuilds.openRevision(record.id, repair.source);
  const target = currentHash === repair.target ? frozen.kit : await localBuilds.openRevision(record.id, repair.target);
  const playback = frozenRepairPlayback(repair, source, target);
  const sourceParts = frozenViewParts(source);
  const unchanged = new Set(repair.plan.comparison.parts.filter((item) => !item.changes.length).map((item) => item.id));
  const originals = new Map(sourceParts.map((part) => [part.id, part]));
  const targetParts = frozenViewParts(target).map((part) => (unchanged.has(part.id) ? originals.get(part.id)! : part));
  const state = { record: repair, source, target, sourceParts, targetParts, revisions: playback.revisions };
  const index = repair.index;

  return {
    ...playback,
    views: playback.steps.map(stepView),
    stepParts: playback.steps.map((step) => step.shown),
    index,
    camera,
    frozen: { record, ...repairView(state, index), repair },
    repairSession: state,
  };
}

export function savedFrozenSession(current: Session | null, record: BuildRecord): Session | null {
  if (current?.frozen?.record.id !== record.id) return current;

  const repair = currentBuildRepair(record);
  const index = repair?.index ?? record.index;
  const state = current.repairSession;
  const view = state ? repairView(state, index) : current.frozen;

  return {
    ...current,
    index,
    frozen: { record, kit: view.kit, parts: view.parts, repair },
    repairSession: state && repair ? { ...state, record: repair } : state,
  };
}

export function navigateFrozenHistory(current: Session, delta: number): Session {
  const index = Math.max(0, Math.min(current.steps.length - 1, current.index + delta));
  const state = current.repairSession;

  if (!state || !current.frozen) return { ...current, index };

  return { ...current, index, frozen: { ...current.frozen, ...repairView(state, index) } };
}
