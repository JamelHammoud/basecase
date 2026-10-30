import { explode } from './guideExplode';
import { isFastener, isInsert, isMajor, itemKeyOf } from './guideItems';
import { fastenerHomes, insertHosts, isUnproven, orderMajors, type FastenerHome, type PlanContext } from './guideOrder';
import { MAIN_MODULE, type GuideModule, type GuideStep } from './guideTypes';

const MERGE_LIMIT = 4;

interface Homes {
  fasteners: Map<string, FastenerHome>;
  hosts: Map<string, string>;
}

interface ModuleParts {
  majors: string[];
  inserts: Map<string, string[]>;
  fasteners: string[];
  deferred: string[];
  all: string[];
}

function calloutOf(ctx: PlanContext, ids: string[]): GuideStep['callout'] {
  const counts = new Map<string, number>();

  for (const id of ids) {
    const key = itemKeyOf(ctx.byId.get(id)!);

    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts].map(([key, qty]) => ({ key, qty }));
}

function draftStep(kind: GuideStep['kind'], moduleId: string, partIds: string[], contextIds: string[]): GuideStep {
  return { kind, number: 0, moduleId, partIds, contextIds, moves: [], arrows: [], callout: [], tools: [] };
}

function partsOfModule(ctx: PlanContext, module: GuideModule, homes: Homes): ModuleParts {
  const majors = module.partIds.filter((id) => isMajor(ctx.byId.get(id)!));
  const majorSet = new Set(majors);
  const inserts = new Map<string, string[]>();

  for (const [insert, host] of homes.hosts) {
    if (majorSet.has(host)) inserts.set(host, [...(inserts.get(host) ?? []), insert]);
  }

  const homed = [...homes.fasteners].filter(([, h]) => h.module === module.id);
  const fasteners = homed.filter(([, h]) => !h.atAttach).map(([id]) => id);
  const deferred = homed.filter(([, h]) => h.atAttach).map(([id]) => id);

  return { majors, inserts, fasteners, deferred, all: [...majors, ...[...inserts.values()].flat(), ...fasteners] };
}

const keysOf = (ctx: PlanContext, ids: string[]) =>
  [...new Set(ids.map((id) => itemKeyOf(ctx.byId.get(id)!)))].sort().join(';');

function canMerge(ctx: PlanContext, prev: GuideStep | undefined, major: string, ready: string[]): prev is GuideStep {
  if (prev?.kind !== 'build') return false;

  const key = itemKeyOf(ctx.byId.get(major)!);
  const prevMajors = prev.partIds.filter((id) => isMajor(ctx.byId.get(id)!));
  const prevFasteners = prev.partIds.filter((id) => isFastener(ctx.byId.get(id)!));

  return (
    prevMajors.length < MERGE_LIMIT &&
    prevMajors.every((id) => itemKeyOf(ctx.byId.get(id)!) === key) &&
    keysOf(ctx, prevFasteners) === keysOf(ctx, ready) &&
    prevFasteners.length === ready.length * prevMajors.length
  );
}

interface ModuleRun {
  ctx: PlanContext;
  module: GuideModule;
  parts: ModuleParts;
  homes: Homes;
  outside: Set<string>;
}

function moduleSteps({ ctx, module, parts, homes, outside }: ModuleRun): GuideStep[] {
  const steps: GuideStep[] = [];
  const placed: string[] = [];
  const placedMajors = new Set<string>();
  let pending = parts.fasteners;

  for (const major of orderMajors(ctx, parts.majors, outside)) {
    const inserts = parts.inserts.get(major) ?? [];

    if (inserts.length) steps.push(draftStep('inserts', module.id, inserts, [major]));

    placedMajors.add(major);

    const ready = pending.filter((f) => homes.fasteners.get(f)!.gate.every((g) => placedMajors.has(g)));
    const prev = steps.at(-1);

    pending = pending.filter((f) => !ready.includes(f));

    if (!inserts.length && canMerge(ctx, prev, major, ready) && !!prev.unproven === isUnproven(ctx, [major]))
      prev.partIds.push(major, ...ready);
    else steps.push(marked(ctx, draftStep('build', module.id, [major, ...inserts, ...ready], [...placed])));

    placed.push(major, ...inserts, ...ready);
  }

  if (pending.length) steps.push(draftStep('build', module.id, pending, [...placed]));

  return steps;
}

function marked(ctx: PlanContext, step: GuideStep): GuideStep {
  return isUnproven(ctx, step.partIds) ? { ...step, unproven: true } : step;
}

function withCallout(ctx: PlanContext, step: GuideStep): GuideStep {
  const shown = step.partIds.filter((id) => step.kind === 'inserts' || !isInsert(ctx.byId.get(id)!));

  return { ...step, callout: calloutOf(ctx, shown) };
}

function attachStep(ctx: PlanContext, module: GuideModule, parts: ModuleParts, assembled: string[]): GuideStep {
  const step = draftStep('attach', MAIN_MODULE, [...parts.all, ...parts.deferred], [...assembled]);
  const exploded = explode(ctx, step, new Set(parts.deferred));

  return {
    ...step,
    ...exploded,
    attach: module.id,
    callout: [{ key: `module:${module.id}`, qty: 1 }, ...calloutOf(ctx, parts.deferred)],
  };
}

function numberSteps(steps: GuideStep[]): GuideStep[] {
  const counters = new Map<string, number>();

  return steps.map((s) => {
    const n = (counters.get(s.moduleId) ?? 0) + 1;

    counters.set(s.moduleId, n);

    return { ...s, number: n };
  });
}

export function buildSteps(ctx: PlanContext, modules: GuideModule[]): GuideStep[] {
  const moduleOf = new Map<string, string>();

  modules.forEach((m) => m.partIds.forEach((id) => moduleOf.set(id, m.id)));

  const rank = new Map(modules.map((m, i) => [m.id, i]));
  const all = [...moduleOf.keys()].filter((id) => ctx.byId.has(id));
  const homes: Homes = {
    fasteners: fastenerHomes(
      ctx,
      all.filter((id) => isFastener(ctx.byId.get(id)!)),
      moduleOf,
      rank,
    ),
    hosts: insertHosts(
      ctx,
      all.filter((id) => isInsert(ctx.byId.get(id)!)),
    ),
  };
  const steps: GuideStep[] = [];
  const assembled: string[] = [];

  for (const module of modules) {
    const parts = partsOfModule(ctx, module, homes);
    const outside = new Set(assembled);

    if (module.mirrored) {
      steps.push(withCallout(ctx, draftStep('mirror', module.id, parts.all, [])));
    } else if (!module.repeatOf) {
      const own = moduleSteps({ ctx, module, parts, homes, outside });

      steps.push(...own.map((s) => withCallout(ctx, { ...s, ...explode(ctx, s) })));
    }

    if (module.id === MAIN_MODULE) {
      assembled.push(...parts.all, ...parts.deferred);

      continue;
    }

    steps.push(attachStep(ctx, module, parts, assembled));
    assembled.push(...parts.all, ...parts.deferred);
  }

  return numberSteps(steps);
}
