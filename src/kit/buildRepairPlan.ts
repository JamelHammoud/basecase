import { canonicalJson } from '../skills/hash';
import { buildDemand } from './buildDemand';
import { indexFasteners } from '../assembly/fastenerIndex';
import { planRemoval } from '../assembly/removalOrder';
import { prepareRepairInserts } from '../guide/repairInserts';
import { repairCallout } from '../guide/repairItems';
import { buildRepairPlan } from '../guide/repairPlan';
import type { GuidePlan } from '../guide/guideTypes';
import { compareBuildRevisions, type BuildRevisionComparison } from './buildRepairComparison';
import { retainedRepairGeometry } from './buildRepairGeometry';
import { repairDeclarations, sameJointTopology, type RepairDeclaration } from './buildRepairDeclarations';
import type { FrozenKit } from './frozenKit';

export interface BuildRepairPlan {
  comparison: BuildRevisionComparison;
  refusal: 'checks' | 'identity' | 'topology' | 'group' | 'access' | 'manufacturing' | null;
  declarations: RepairDeclaration[];
  phases: Array<{ revision: 'source' | 'target'; plan: GuidePlan }>;
}

function initialRefusal(
  source: FrozenKit,
  target: FrozenKit,
  comparison: BuildRevisionComparison,
): BuildRepairPlan['refusal'] {
  if (target.manifest.checks.freshness !== 'current' || target.manifest.checks.result?.status !== 'ready')
    return 'checks';

  if (comparison.unresolved.length) return 'identity';

  if (comparison.topology || comparison.parts.some((part) => part.changes.includes('placement'))) return 'topology';

  if (!sameJointTopology(source, target)) return 'topology';

  if (!samePrintProcess(source, target)) return 'manufacturing';

  return null;
}

function supportedGroup(kit: FrozenKit, affected: string[]) {
  if (affected.length === 1) return true;

  if (affected.length > 20) return false;

  const group = kit.parts.find((part) => part.id === affected[0])?.group?.id;

  return !!group && affected.every((id) => kit.parts.find((part) => part.id === id)?.group?.id === group);
}

function measuredPlan(kit: FrozenKit, affected: string[]) {
  const measured = retainedRepairGeometry(kit, affected);
  const groups = Object.fromEntries(kit.parts.map((part) => [part.id, part.group?.id]));
  const removal = planRemoval(measured.geometry, groups);
  const order = new Map(removal.steps.flatMap((step, index) => step.ids.map((id) => [id, index] as const)));
  const anchor = affected.reduce((before, id) => ((order.get(id) ?? -1) > (order.get(before) ?? -1) ? id : before));
  const plan = buildRepairPlan(kit.manifest.guide, removal, anchor, measured);

  return { measured, removal, plan };
}

const removedIds = (plan: GuidePlan) =>
  new Set(plan.steps.filter((step) => step.repairPhase === 'remove').flatMap((step) => step.partIds));

function preparationForGroup(kit: FrozenKit, measured: ReturnType<typeof retainedRepairGeometry>, ids: string[]) {
  const fasteners = indexFasteners(measured.geometry.chains.screws);
  const steps = ids.map((target) => prepareRepairInserts({ ...measured, plan: kit.manifest.guide, target, fasteners }));

  return steps.some((step) => step === null) ? null : steps.flatMap((step) => step ?? []);
}

export function planBuildRevisionRepair(source: FrozenKit, target: FrozenKit): BuildRepairPlan {
  const comparison = compareBuildRevisions(source, target);
  const refusal = initialRefusal(source, target, comparison);
  const result: BuildRepairPlan = {
    comparison,
    refusal,
    phases: [],
    declarations: refusal ? [] : repairDeclarations(source, target, comparison),
  };
  const affected = comparison.replacements;

  if (!supportedManufacturing(target, result)) return { ...result, refusal: 'manufacturing' };

  if (result.declarations.length > 256) return { ...result, refusal: 'group' };

  if (refusal || !affected.length) return result;

  if (!supportedGroup(source, affected) || !supportedGroup(target, affected)) return { ...result, refusal: 'group' };

  const before = measuredPlan(source, affected);
  const after = measuredPlan(target, affected);

  if (!before.plan || !after.plan) return { ...result, refusal: 'access' };

  const removed = removedIds(before.plan);
  const restored = removedIds(after.plan);

  if (removed.size > 60) return { ...result, refusal: 'group' };

  const covered = affected.every((id) => removed.has(id) && restored.has(id));
  const matching = removed.size === restored.size && [...removed].every((id) => restored.has(id));
  const preparation = preparationForGroup(target, after.measured, affected);

  if (!covered || !matching || !preparation) return { ...result, refusal: 'access' };

  const sourcePlan = {
    ...before.plan,
    steps: before.plan.steps.filter((step) => step.repairPhase === 'remove'),
  };
  const swap = after.plan.steps.find((step) => step.repairPhase === 'swap')!;
  const targetPlan = {
    ...after.plan,
    steps: [
      { ...swap, partIds: affected, callout: repairCallout(target.manifest.guide, affected) },
      ...preparation,
      ...after.plan.steps.filter((step) => step.repairPhase === 'reassemble' && step.kind !== 'inserts'),
    ].map((step, i) => ({ ...step, number: sourcePlan.steps.length + i + 1 })),
  };

  return {
    ...result,
    phases: [
      { revision: 'source', plan: sourcePlan },
      { revision: 'target', plan: targetPlan },
    ],
  };
}

function supportedManufacturing(target: FrozenKit, plan: BuildRepairPlan) {
  const demand = buildDemand(target);
  const supported = new Set([
    ...demand.components.flatMap((line) => line.partIds),
    ...demand.printed.filter((line) => !line.refusal).map((line) => line.partId),
  ]);
  const components = new Set(demand.components.map((line) => line.key));
  const fabricated = new Set(target.manifest.fabricated?.map((part) => part.partId));

  return (
    plan.comparison.replacements.every((id) => supported.has(id) && !fabricated.has(id)) &&
    plan.declarations.every((action) => !action.replacementKey || components.has(action.replacementKey))
  );
}

function samePrintProcess(source: FrozenKit, target: FrozenKit) {
  const settings = (kit: FrozenKit) => [
    kit.project.infillPct,
    kit.project.printProcess,
    kit.parts.map((part) => [part.id, part.print?.down]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  ];

  return canonicalJson(settings(source)) === canonicalJson(settings(target));
}
