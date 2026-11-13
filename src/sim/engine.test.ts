import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { fixtureModel } from '../skills/fixtureModels';
import { SimEngine } from './engine';
import { Recorder } from './recorder';

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

const crouch = (legs: number) =>
  Object.fromEntries(
    Array.from({ length: legs }, (_, i) => [
      [`leg${i}_swing`, 60],
      [`leg${i}_bend`, -120],
    ]).flat(),
  );

function held(id: string, faults: Record<string, 'limp'> = {}, values?: Record<string, number>) {
  const engine = new SimEngine(mj, fixtureModel(id));

  engine.setController({ kind: 'hold', values });
  engine.step(1);

  for (const [joint, kind] of Object.entries(faults)) engine.setFault(joint, kind);

  engine.step(2);

  const robot = engine.stats().robots[0];

  engine.dispose();

  return robot;
}

const qposOf = (engine: SimEngine, joint: string) =>
  engine.data.qpos[engine.jointAddresses()[engine.sim.joints.findIndex((j) => j.id === joint)]];

describe('servo faults', () => {
  it('a quad crouched on Hold with a limp stance knee sinks and leans more than a healthy one', () => {
    const healthy = held('quad-servo', {}, crouch(4));
    const limp = held('quad-servo', { leg0_bend: 'limp' }, crouch(4));

    expect(healthy.fellAt).toBeNull();
    expect(limp.height).toBeLessThan(healthy.height - 0.0005);
    expect(limp.tilt).toBeGreaterThan(healthy.tilt + 0.3);
  });

  it('a hexapod with a limp middle leg stays up', () => {
    const healthy = held('hexapod', {}, crouch(6));
    const robot = held('hexapod', { leg2_abduct: 'limp', leg2_swing: 'limp', leg2_bend: 'limp' }, crouch(6));

    expect(robot.height).toBeLessThan(healthy.height);
    expect(robot.fellAt).toBeNull();
    expect(robot.tilt).toBeLessThan(35);
  });

  it('weakens, stiffens and restores the exact force range on Clear, through Limp too', () => {
    const engine = new SimEngine(mj, fixtureModel('quad-servo'));
    const before: number[] = Array.from(engine.model.actuator_forcerange);
    const knee = engine.sim.joints.find((j) => j.id === 'leg0_bend')!.actuator;
    const range = (): number[] => Array.from(engine.model.actuator_forcerange);

    engine.setFault('leg0_bend', 'weak');
    expect(range()[knee * 2 + 1]).toBeCloseTo(before[knee * 2 + 1] / 2, 9);
    engine.setFault('leg0_bend', 'limp');
    expect(range()[knee * 2 + 1]).toBe(0);
    engine.setController({ kind: 'limp' });
    expect(range().every((v) => v === 0)).toBe(true);
    engine.setController({ kind: 'hold' });
    expect(range()[knee * 2 + 1]).toBe(0);
    expect(range()[(knee + 1) * 2 + 1]).toBe(before[(knee + 1) * 2 + 1]);
    engine.setFault('leg0_bend', 'stuck');
    expect(range()).toEqual(before);
    engine.setFault('leg0_bend', null);
    expect(range()).toEqual(before);
    expect(engine.stats().joints.some((j) => j.fault)).toBe(false);
    engine.setFault('no-such-joint', 'limp');
    expect(range()).toEqual(before);
    engine.dispose();
  });

  it('holds a stuck joint where it was when the target moves', () => {
    const engine = new SimEngine(mj, fixtureModel('arm-3dof'));
    const joint = engine.sim.joints[1].id;

    engine.setController({ kind: 'hold', values: { [joint]: 20 } });
    engine.step(1);

    const at = qposOf(engine, joint);

    engine.setFault(joint, 'stuck');
    engine.setController({ kind: 'hold', values: { [joint]: -20 } });
    engine.step(1);
    expect(engine.stats().joints[1].fault).toBe('stuck');
    expect(Math.abs(qposOf(engine, joint) - at)).toBeLessThan(0.02);
    engine.dispose();
  });

  it('Laggy re-primes without a jump, then follows 60 ms late', () => {
    const lagged = new SimEngine(mj, fixtureModel('arm-3dof'));
    const healthy = new SimEngine(mj, fixtureModel('arm-3dof'));
    const joint = lagged.sim.joints[1].id;
    const both = (fn: (e: SimEngine) => void) => [lagged, healthy].forEach(fn);

    both((e) => e.setController({ kind: 'hold', values: { [joint]: 20 } }));
    both((e) => e.step(1));

    const settled = qposOf(lagged, joint);

    lagged.setFault(joint, 'laggy');
    lagged.step(0.04);
    expect(Math.abs(qposOf(lagged, joint) - settled)).toBeLessThan(1e-3);

    both((e) => e.setController({ kind: 'hold', values: { [joint]: -20 } }));
    both((e) => e.step(0.05));

    const healthyMoved = Math.abs(qposOf(healthy, joint) - settled);

    expect(healthyMoved).toBeGreaterThan(0.02);
    expect(Math.abs(qposOf(lagged, joint) - settled)).toBeLessThan(healthyMoved * 0.25);
    both((e) => e.step(1));
    expect(qposOf(lagged, joint)).toBeCloseTo(qposOf(healthy, joint), 2);
    both((e) => e.dispose());
  });

  it('records each fault on the try with its start and end times', () => {
    const engine = new SimEngine(mj, fixtureModel('quad-servo'));

    engine.setFault('leg1_bend', 'weak');

    const recorder = new Recorder(engine);

    engine.stepHook = recorder.hook;
    engine.step(0.5);
    engine.setFault('leg0_bend', 'limp');
    recorder.fault('leg0_bend', 'limp');
    engine.step(0.25);
    engine.setFault('leg0_bend', null);
    recorder.fault('leg0_bend', null);

    const { faults } = recorder.finish();

    expect(faults).toEqual([
      { joint: 'leg1_bend', kind: 'weak', at: 0 },
      { joint: 'leg0_bend', kind: 'limp', at: expect.closeTo(0.5, 2), until: expect.closeTo(0.75, 2) },
    ]);
    engine.dispose();
  });
});
