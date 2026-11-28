import type { ForceEvidence } from '../contactForces';
import type { SimModel } from '../mjcfTypes';

const grip = (prefix: string, x: number) => `
  <body name="${prefix}left" pos="${x - 0.025} 0 0.025">
    <joint name="${prefix}left" type="slide" axis="1 0 0" range="0 0.02" damping="1"/>
    <geom type="box" size="0.005 0.02 0.02" mass="0.03"/>
  </body>
  <body name="${prefix}right" pos="${x + 0.025} 0 0.025">
    <joint name="${prefix}right" type="slide" axis="-1 0 0" range="0 0.02" damping="1"/>
    <geom type="box" size="0.005 0.02 0.02" mass="0.03"/>
  </body>
  <body name="${prefix}object" pos="${x} 0 0.011">
    <freejoint/>
    <geom type="box" size="0.01 0.01 0.01" mass="0.08" friction="0.8 0.005 0.0001"/>
  </body>`;

const names = ['left', 'right', 'object', 'otherLeft', 'otherRight', 'otherObject'];
const nativeNames = ['left', 'right', 'object', 'otherleft', 'otherright', 'otherobject'];
const joints = [0, 1, 3, 4];

export function forceFixture(): SimModel {
  return {
    version: 2,
    xml: `<mujoco><option timestep="0.002"/><worldbody>
      <geom type="plane" size="1 1 0.1"/>
      ${grip('', 0)}${grip('other', 0.2)}
      </worldbody><actuator>${joints.map((index) => `<position joint="${nativeNames[index]}" kp="1000" kv="5" forcerange="-5 5"/>`).join('')}</actuator></mujoco>`,
    bodies: names.map((name, i) => ({
      name: nativeNames[i],
      parts: [name],
      origin: [0, 0, 0],
      ...(joints.includes(i) ? { joint: name } : { world: [name] }),
    })),
    joints: joints.map((i, actuator) => ({
      id: names[i],
      name: nativeNames[i],
      type: 'prismatic',
      range: [0, 20],
      effort: 5,
      effortSource: 'published',
      dynamics: 'estimated',
      robot: '',
      drive: 'position',
      actuator,
    })),
    robots: [],
    initial: { values: {} },
    massKg: {},
  };
}

export const forceFixtureEvidence = (): ForceEvidence => ({
  version: 1,
  caseKey: 'fixture',
  modelKey: 'fixture',
  channels: [
    { signal: 'left', jaws: [0], target: [2], peak: false },
    { signal: 'right', jaws: [1], target: [2], peak: false },
    { signal: 'grip', jaws: [0, 1], target: [2], peak: true },
    { signal: 'other', jaws: [3, 4], target: [5], peak: false },
  ],
});
