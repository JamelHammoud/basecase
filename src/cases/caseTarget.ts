import type { PolicySpec } from '../sim/policy';
import type { Case, ProbeEnd } from './schema';

type Command = PolicySpec['command'];

const NO_TARGET: Command = [0, 0, 0];

function endPoint(kase: Case, end: ProbeEnd): Command | null {
  if (typeof end !== 'object') return null;

  const at = 'object' in end ? kase.world.objects.find((o) => o.id === end.object)?.position : null;
  const point = 'point' in end ? end.point : at;

  return point ? [point[0] / 1000, point[1] / 1000, point[2] / 1000] : null;
}

export function caseCommand(kase: Case): Command {
  for (const probe of kase.task.probes) {
    const target = endPoint(kase, probe.to) ?? endPoint(kase, probe.from);

    if (target) return target;
  }

  return NO_TARGET;
}
