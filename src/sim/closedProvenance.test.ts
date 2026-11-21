import loadMujoco from '@mujoco/mujoco';
import { expect, it } from 'vitest';
import { actuatorOf } from '../data/components';
import { partMasses } from '../utils/engineering';
import { SimEngine } from './engine';
import { closedLinkage } from './fixtures/closedLinkages';
import { servoDynamics } from './servoModel';
import { holdingLoad } from './mjcfEffort';

it('retains printed and catalog mass, positive physical inertia, measured servo parameters and self-contact exclusions', async () => {
  const { model, input } = closedLinkage();
  const engine = new SimEngine(await loadMujoco(), model);
  const masses = partMasses(input.parts, input.project, input.measures);
  const grams = masses.reduce((sum, mass) => sum + mass.grams, 0);
  const crank = input.project.joints[0];
  const byMass = new Map(masses.map((m) => [m.id, m]));
  const load = holdingLoad(crank, input.rig, byMass);
  const dynamics = servoDynamics([actuatorOf('feetech-sts3215', 'c001')!], load.momentNm)!;

  try {
    expect(new Set(masses.map((m) => m.source))).toEqual(new Set(['printed', 'catalog']));
    expect(model.massKg[model.robots[0].key]).toBeCloseTo(grams / 1000, 10);
    expect(Array.from(engine.model.body_mass as Float64Array).reduce((sum, v) => sum + v, 0)).toBeCloseTo(
      grams / 1000,
      5,
    );
    expect(engine.model.actuator_gainprm[0]).toBeCloseTo(dynamics.kp, 5);
    expect(engine.model.actuator_delay[0]).toBeCloseTo(dynamics.delayS, 5);
    expect(engine.model.actuator_forcerange[1]).toBeCloseTo(dynamics.forceNm, 5);

    for (const body of model.bodies) {
      const id = engine.sim.bodies.findIndex((b) => b.name === body.name) + 1;

      expect(Array.from(engine.model.body_inertia.slice(id * 3, id * 3 + 3) as Float64Array).every((v) => v > 0)).toBe(
        true,
      );
    }

    engine.step(0.2);
    expect(engine.data.ncon).toBe(0);
  } finally {
    engine.dispose();
  }
});
