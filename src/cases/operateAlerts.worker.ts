import { jsonHash } from '../utils/geometryHash';
import { OperateConditions, type ConditionSample } from './operateConditions';
import type { NamedFailure } from '../skills/contract';
import type { IncidentContext } from '../robot/fleetIncidents';
import { MAX_UNITS } from '../../electron/robot/units.mjs';

export interface AlertCase {
  id: string;
  failures: NamedFailure[];
}

export interface AlertSample extends ConditionSample {
  unit: string;
  context: IncidentContext;
  reset?: boolean;
}

export type AlertRequest = { cases: AlertCase[] } | AlertSample;
export interface AlertResult {
  unit: string;
  context: IncidentContext;
  at: number;
  now: number;
  results: Array<{ key: string; message: string; active: boolean | null }>;
}

let cases: AlertCase[] = [];
const runs = new Map<string, { session: string | null; conditions: OperateConditions[] }>();
let turn = 0;

self.onmessage = async (event: MessageEvent<AlertRequest>) => {
  const request = event.data;

  if ('cases' in request) {
    cases = request.cases;
    runs.clear();
    turn++;

    return;
  }

  const ticket = turn;
  const current = runs.get(request.unit);
  const renew = !current || current.session !== request.context.session || request.reset;
  const run = renew
    ? {
        session: request.context.session,
        conditions: cases.map((kase) => new OperateConditions(kase.failures)),
      }
    : current;

  runs.delete(request.unit);
  runs.set(request.unit, run);

  if (runs.size > MAX_UNITS) runs.delete(runs.keys().next().value!);

  const results = await Promise.all(
    cases.map(async (kase, index) => {
      const active = await run.conditions[index].sample({ ...request, now: Date.now() });

      return kase.failures.map((failure, k) => ({
        key: `case:${jsonHash(failure)}:${request.context.sceneId}:${kase.id}`,
        message: failure.label,
        active: active[k],
      }));
    }),
  );

  if (ticket === turn) self.postMessage({ ...request, results: results.flat() } satisfies AlertResult);
};
