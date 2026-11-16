import { useEffect } from 'react';
import type { AlertRequest, AlertResult, AlertSample } from '../cases/operateAlerts.worker';
import { OPERATE_FACT_MAX_AGE_MS, operatePredicate } from '../cases/operateConditions';
import { readCases } from '../cases/schema';
import type { ProjectSettings } from '../types/robotics';
import { incidentContext } from '../robot/fleetIncidents';
import { fleetIncidents, publishIncidents } from '../robot/fleetIncidentStore';
import { operateTelemetry } from '../robot/operateTelemetry';
import { subscribeFleetEvents } from '../robot/robotStore';

const MAX_PENDING_UNITS = 32;

export function useOperateAlerts(records: ProjectSettings['cases'], sceneId: string) {
  const config = JSON.stringify(
    readCases(records)
      .map((kase) => ({
        id: kase.id,
        failures: kase.task.contract.failures.filter((f) => operatePredicate(f.formula)),
      }))
      .filter((kase) => kase.failures.length > 0),
  );

  useEffect(() => {
    const configured = JSON.parse(config) as import('../cases/operateAlerts.worker').AlertCase[];

    if (!configured.length) return;

    const worker = new Worker(new URL('../cases/operateAlerts.worker.ts', import.meta.url), { type: 'module' });
    const busy = new Set<string>();
    const pending = new Map<string, AlertSample>();
    const clocks = new Map<string, { origin: number; last: number }>();
    const post = (request: AlertRequest) => worker.postMessage(request);
    const send = (request: AlertSample) => {
      busy.add(request.unit);
      post(request);
    };

    post({ cases: configured });
    worker.onmessage = (event: MessageEvent<AlertResult>) => {
      const reply = event.data;
      let changed = false;

      const results = Date.now() - reply.at <= OPERATE_FACT_MAX_AGE_MS ? reply.results : [];

      for (const result of results)
        changed = fleetIncidents.condition({ ...reply, ...result }, result.active, reply.now) || changed;

      if (changed) publishIncidents();

      busy.delete(reply.unit);

      const next = pending.get(reply.unit);

      pending.delete(reply.unit);

      if (next) send(next);
    };

    const unsubscribe = subscribeFleetEvents((event) => {
      const unit = typeof event.unit === 'string' ? event.unit : 'robot';

      if (event.event === 'link') clocks.delete(unit);

      if (event.event !== 'status' || typeof event.at_us !== 'number' || !Number.isFinite(event.at_us)) return;

      const context = incidentContext(event.context);
      const now = Date.now();
      const stamp = event.at_us / 1000;
      const clock = clocks.get(unit) ?? { origin: now - stamp, last: -Infinity };

      if (context.sceneId !== sceneId || stamp <= clock.last || (clocks.size >= MAX_PENDING_UNITS && !clocks.has(unit)))
        return;

      clocks.set(unit, { ...clock, last: stamp });

      const sample: AlertSample = { unit, at: clock.origin + stamp, now, signals: operateTelemetry(event), context };

      if (!busy.has(unit)) return send(sample);

      pending.set(unit, { ...sample, reset: pending.has(unit) });
    });

    return () => {
      unsubscribe();
      worker.terminate();
    };
  }, [config, sceneId]);
}
