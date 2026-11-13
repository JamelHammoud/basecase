import type { SimEngine } from './engine';

export function torqueShare(engine: Pick<SimEngine, 'model' | 'data' | 'sim'>): number {
  const force = engine.data.actuator_force;
  const range = engine.model.actuator_forcerange;
  let worst = 0;

  for (const { actuator } of engine.sim.joints) {
    const cap = actuator < 0 ? 0 : range[actuator * 2 + 1];

    if (cap > 0) worst = Math.max(worst, Math.abs(force[actuator]) / cap);
  }

  return worst;
}
