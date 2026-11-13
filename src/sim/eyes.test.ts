import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ScenePart } from '../types/robotics';
import { buildEye, eyeCaster, eyeSize, type Eye } from './eyes';
import type { SimModel } from './mjcfTypes';
import { isPolicySpec, policyObsSize, POLICY_FORMAT, POLICY_VERSION, type PolicySpec } from './policy';

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

const XML = `<mujoco>
  <worldbody>
    <body name="head" pos="0 0 0.5">
      <geom type="sphere" size="0.02"/>
    </body>
    <body name="wall" pos="1.25 0 0.5">
      <geom type="box" size="0.25 1 1"/>
    </body>
  </worldbody>
</mujoco>`;

const eye = (dirs: number[], rangeM = 3): Eye => ({
  part: 'cam',
  body: 'head',
  pos: [0, 0, 0],
  dirs,
  cols: dirs.length / 3,
  rows: 1,
  rangeM,
});

function cast(e: Eye): Float32Array {
  const model = mj.MjModel.from_xml_string(XML);
  const data = new mj.MjData(model);
  const caster = eyeCaster(mj, model, data, [e]);

  if (typeof caster === 'string') throw new Error(caster);

  const out = new Float32Array(2 + eyeSize([e])).fill(-7);

  caster.cast(out, 2);
  caster.dispose();
  data.delete();
  model.delete();

  return out;
}

describe('depth eye casting', () => {
  it('reads the distance to a wall as a share of its range', () => {
    const out = cast(eye([1, 0, 0]));

    expect(out[0]).toBe(-7);
    expect(out[2]).toBeCloseTo(1 / 3, 5);
  });

  it('reads 1 for a miss, a ray past its range, and no ray at all', () => {
    const out = cast(eye([-1, 0, 0, 1, 0, 0, 0, 0, 0], 0.5));

    expect([...out.slice(2)]).toEqual([1, 1, 1]);
  });

  it('refuses a body the model lacks', () => {
    const model = mj.MjModel.from_xml_string(XML);
    const data = new mj.MjData(model);

    expect(eyeCaster(mj, model, data, [{ ...eye([1, 0, 0]), body: 'nope' }])).toMatch(/nope/);
    data.delete();
    model.delete();
  });
});

const camera: ScenePart = {
  id: 'cam',
  name: 'Head Camera',
  kind: 'component',
  category: 'primitives',
  role: 'solid',
  componentId: 'raspberry-pi-camera-3',
  position: [0, 500, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 25, height: 12, depth: 24 },
  color: '#fff',
  note: '',
  visible: true,
  locked: false,
};

const simModel = { bodies: [{ name: 'root_0', parts: ['cam'], origin: [0, 400, 0] }] } as unknown as SimModel;

describe('building an eye from a camera part', () => {
  it('lays one direction per ray, all unit length, in the carrying body’s frame', () => {
    const built = buildEye(simModel, [camera], { part: 'cam', cols: 4, rows: 3 });

    if (typeof built === 'string') throw new Error(built);

    expect(built.body).toBe('root_0');
    expect(built.dirs).toHaveLength(36);

    for (let i = 0; i < built.dirs.length; i += 3) expect(Math.hypot(...built.dirs.slice(i, i + 3))).toBeCloseTo(1, 5);

    expect(built.pos[2]).toBeGreaterThan(0.09);
  });

  it('refuses a part off the robot and a grid out of bounds', () => {
    expect(buildEye({ bodies: [] } as unknown as SimModel, [camera], { part: 'cam' })).toMatch(/isn't on the robot/);
    expect(buildEye(simModel, [camera], { part: 'cam', cols: 99 })).toMatch(/columns/);
  });
});

describe('policies with eyes', () => {
  const spec = (extra: Partial<PolicySpec>): PolicySpec =>
    ({
      format: POLICY_FORMAT,
      version: POLICY_VERSION,
      joints: ['a', 'b'],
      layers: [],
      obsMean: new Array(18).fill(0),
      ...extra,
    }) as PolicySpec;

  it('counts eye rays after the body’s own observation', () => {
    expect(policyObsSize(spec({}))).toBe(18);
    expect(policyObsSize(spec({ eyes: [eye([1, 0, 0, 0, 1, 0])] }))).toBe(20);
  });

  it('refuses a policy whose normalizer is the wrong width', () => {
    expect(isPolicySpec(spec({}))).toBe(true);
    expect(isPolicySpec(spec({ eyes: [eye([1, 0, 0])] }))).toBe(false);
    expect(isPolicySpec(spec({ eyes: [eye([1, 0, 0])], obsMean: new Array(19).fill(0) }))).toBe(true);
  });
});
