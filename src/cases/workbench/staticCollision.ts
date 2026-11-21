import type { MainModule } from '@mujoco/mujoco';
import { SimEngine } from '../../sim/engine';
import type { SimModel } from '../../sim/mjcfTypes';

type Collision = 'clear' | 'obstructed' | 'unresolved';

const PENETRATION_M = 1e-6;

function staticPairs(mj: MainModule, engine: SimEngine) {
  const bodyId = (name: string) => mj.mj_name2id(engine.model, mj.mjtObj.mjOBJ_BODY.value, name);
  const robot = new Set(engine.sim.bodies.filter((body) => body.robot).map((body) => bodyId(body.name)));
  const base: number[] = [];
  const fixtures: number[] = [];

  for (let geom = 0; geom < engine.model.ngeom; geom++) {
    const body = engine.model.geom_bodyid[geom];
    const fixed = engine.model.body_weldid[body] === 0;
    const collides = engine.model.geom_contype[geom] !== 0 || engine.model.geom_conaffinity[geom] !== 0;

    if (!fixed || !collides) continue;

    if (robot.has(body)) base.push(geom);

    if (!robot.has(body)) fixtures.push(geom);
  }

  return { base, fixtures };
}

export function staticPlacementCollision(mj: MainModule, model: SimModel): Collision {
  const engine = new SimEngine(mj, model);
  const closest = new mj.DoubleBuffer(6);

  try {
    engine.refreshKinematics();

    return queryPairs(mj, engine, staticPairs(mj, engine), closest);
  } finally {
    closest.delete();
    engine.dispose();
  }
}

function queryPairs(
  mj: MainModule,
  engine: SimEngine,
  { base, fixtures }: ReturnType<typeof staticPairs>,
  closest: InstanceType<MainModule['DoubleBuffer']>,
): Collision {
  if (!base.length || !fixtures.length) return 'unresolved';

  for (const a of base) {
    for (const b of fixtures) {
      const distance = mj.mj_geomDistance(engine.model, engine.data, a, b, 0, closest);

      if (!Number.isFinite(distance)) return 'unresolved';

      if (distance < -PENETRATION_M) return 'obstructed';
    }
  }

  return 'clear';
}
