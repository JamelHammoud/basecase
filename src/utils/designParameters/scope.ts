import { surfaceOperands } from '../../booleans/operands';
import type { ScenePart } from '../../types/robotics';
import type { ParameterPartPlan } from './plan';
import type { ParameterGeometryJob } from './transaction';

export function changedParameterPlan(plan: ParameterPartPlan): boolean {
  if (plan.kind === 'cad') return false;

  if (plan.kind === 'primitive')
    return Object.entries(plan.values).some(
      ([name, value]) => plan.part.dimensions[name as keyof ScenePart['dimensions']] !== value,
    );

  return Object.entries(plan.values).some(([id, value]) => {
    const constraint = plan.part.sketch!.sketch.constraints.find((candidate) => candidate.id === id);

    return constraint && 'value' in constraint && constraint.value !== value;
  });
}

function connections(parts: ScenePart[]) {
  const linked = new Map<string, Set<string>>();
  const connect = (a: string, b: string) => {
    if (!linked.has(a)) linked.set(a, new Set());

    linked.get(a)!.add(b);
  };

  for (const part of parts) {
    const targets = [
      part.sketch?.support?.partId,
      ...(part.mates ?? []).map((mate) => mate.target),
      ...(part.boolean?.operands ?? []).map((operand) => operand.id),
    ];

    for (const target of targets.filter((id) => id !== undefined)) {
      connect(part.id, target);
      connect(target, part.id);
    }
  }

  return linked;
}

export function connectedParameterIds(parts: ScenePart[], targets: Iterable<string>) {
  const wanted = new Set(targets);
  const pending = [...wanted];
  const graph = connections(surfaceOperands(parts));

  for (let i = 0; i < pending.length; i++) {
    for (const id of graph.get(pending[i]) ?? []) {
      if (wanted.has(id)) continue;

      wanted.add(id);
      pending.push(id);
    }
  }

  return wanted;
}

export function parameterGeometryScope(job: ParameterGeometryJob): ParameterGeometryJob {
  const changed = job.plans.filter(
    (plan) => changedParameterPlan(plan) || job.verify || job.force?.includes(plan.part.id),
  );
  const wanted = connectedParameterIds(job.parts, [
    ...changed.map((plan) => plan.part.id),
    ...job.cad.map((cad) => cad.id),
  ]);
  const parts = job.parts.filter((part) => surfaceOperands([part]).some((item) => wanted.has(item.id)));

  return { parts, plans: changed, cad: job.cad, verify: job.verify, force: job.force };
}
