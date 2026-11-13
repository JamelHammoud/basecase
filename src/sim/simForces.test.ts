import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { TorqueRecorder, jointPeak, peakStatus } from '../utils/peakTorque';
import { walkPower } from '../utils/servoAmps';
import { SimEngine } from './engine';
import type { SimModel } from './mjcf';
import { demandedTorques, limitForces } from './simForces';

const ARM_KG = 1;
const ARM_M = 0.2;
const HOLD_NM = ARM_KG * 9.81 * ARM_M;

const arm = (effort: number): SimModel => ({
  version: 0,
  xml: `<mujoco>
  <option timestep="0.002"/>
  <worldbody>
    <body name="b_arm" pos="0 0 1">
      <joint name="j0_arm" type="hinge" axis="0 1 0" damping="0.05"/>
      <geom type="capsule" fromto="0 0 0 ${ARM_M * 2} 0 0" size="0.01" mass="0"/>
      <geom type="sphere" pos="${ARM_M} 0 0" size="0.02" mass="${ARM_KG}"/>
    </body>
  </worldbody>
  <actuator>
    <position name="j0_arm" joint="j0_arm" kp="${effort / 0.17}" dampratio="1" forcerange="${-effort} ${effort}"/>
  </actuator>
</mujoco>`,
  bodies: [{ name: 'b_arm', parts: ['arm'], origin: [0, 0, 0] }],
  joints: [
    {
      id: 'arm',
      name: 'j0_arm',
      type: 'revolute',
      effort,
      effortSource: 'servo',
      dynamics: 'estimated',
      robot: 'r',
      drive: 'position',
      actuator: 0,
    },
  ],
  robots: [],
  initial: { values: {} },
  massKg: {},
  warnings: [],
});

const AMPS = { idleA: 0.15, perNmA: 0.8 };

async function holdArm(stallNm: number, limitNm: number) {
  const mj = await loadMujoco();
  const engine = new SimEngine(mj, arm(stallNm));
  const recorder = new TorqueRecorder(1, engine.dt, { amps: [AMPS] });
  const demand = new Float64Array(1);

  limitForces(engine.model, engine.sim, { arm: limitNm });
  engine.step(2, () =>
    recorder.add(demandedTorques(engine.model, engine.data, engine.sim.joints, demand), engine.data.actuator_force),
  );

  const peak = jointPeak(recorder.series(), 0, stallNm, { settleS: 1, heatFromS: 1, heatToS: 2 });
  const power = walkPower(recorder.series(), ['arm'], { settleS: 1 });

  engine.dispose();

  return { ...peak, power };
}

describe('Peak torque in MuJoCo', () => {
  it('measures the torque a held arm needs when the servo is strong enough', async () => {
    const peak = await holdArm(4, 0.7 * 4);

    expect(peak.p99Nm).toBeCloseTo(HOLD_NM, 1);
    expect(peak.rmsNm).toBeCloseTo(HOLD_NM, 1);
    expect(peak.overS).toBe(0);
    expect(peakStatus(peak, 4)).toBe('pass');
    expect(peak.power.joints.arm.avgA).toBeCloseTo(AMPS.idleA + AMPS.perNmA * HOLD_NM, 1);
    expect(peak.power.avgA).toBeCloseTo(peak.power.joints.arm.avgA, 9);
  });

  it('reports what a derated servo is asked for, past its limit, and fails it', async () => {
    const peak = await holdArm(1.8, 0.7 * 1.8);

    expect(peak.rmsNm).toBeCloseTo(0.7 * 1.8, 2);
    expect(peak.p99Nm).toBeGreaterThan(1.8);
    expect(peak.overS).toBeGreaterThan(0.9);
    expect(peakStatus(peak, 1.8)).toBe('fail');
  });
});
