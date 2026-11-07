import { describe, expect, it } from 'vitest';
import { box } from '../../src/sim/fixtures/parts';
import { fixtureRobots } from '../../src/sim/fixtures/robots';
import { compileRoutine, greetingRoutine } from '../../src/routines/testing';
import type { ScenePart } from '../../src/types/robotics';
import { need } from '../lib/need';
import { greeter, greeterWithoutCamera, greeterWithoutHead } from './greeter';
import { CAPABILITIES_MODULE, type CapabilitiesModule, type PhysicsRobot } from './interfaces';

const capabilities = () => need<CapabilitiesModule>(CAPABILITIES_MODULE, ['sceneCapabilities']);

const fixture = (id: string): PhysicsRobot => {
  const robot = fixtureRobots().find((r) => r.id === id);

  if (!robot) throw new Error(`No fixture robot ${id}`);

  return robot;
};

const withPart = (robot: PhysicsRobot, id: string, componentId: string): PhysicsRobot => {
  const part: ScenePart = { ...box(id, [0, 200, 0], [30, 20, 30], 20), kind: 'component', componentId };

  return { ...robot, parts: [...robot.parts, part] };
};

describe('capabilities come from the scene', () => {
  it('reads sensors from catalog parts and movers from joints', async () => {
    const { sceneCapabilities } = await capabilities();
    const has = (robot: PhysicsRobot) => new Set(sceneCapabilities(robot));

    expect([...has(greeter())]).toEqual(expect.arrayContaining(['camera', 'speaker', 'legs', 'head']));
    expect(has(greeterWithoutCamera()).has('camera')).toBe(false);
    expect(has(greeterWithoutHead()).has('head')).toBe(false);
    expect(has(greeterWithoutHead()).has('camera')).toBe(true);

    const quad = has(fixture('quad-servo'));

    expect(quad.has('legs')).toBe(true);
    expect(['camera', 'speaker', 'microphone', 'depth', 'wheels', 'head'].filter((c) => quad.has(c as never))).toEqual(
      [],
    );
    expect(has(fixture('rover-diff')).has('wheels')).toBe(true);
    expect(has(fixture('rover-diff')).has('legs')).toBe(false);
    expect(has(fixture('arm-3dof')).has('arms')).toBe(true);
    expect(has(withPart(fixture('quad-servo'), 'mic', 'seeed-respeaker-mic-array-v2')).has('microphone')).toBe(true);
    expect(has(withPart(fixture('quad-servo'), 'oak', 'luxonis-oak-d-lite')).has('depth')).toBe(true);
  });

  it('a robot with no camera is refused a vision Routine, in plain words', async () => {
    const { sceneCapabilities } = await capabilities();
    const blind = compileRoutine(greetingRoutine(), { capabilities: sceneCapabilities(greeterWithoutCamera()) });
    const sighted = compileRoutine(greetingRoutine(), { capabilities: sceneCapabilities(greeter()) });

    expect(blind.ok).toBe(false);
    expect(blind.errors?.some((e) => e.code === 'missing-capability' && /camera/i.test(e.message))).toBe(true);
    expect(sighted.ok).toBe(true);
  });
});
