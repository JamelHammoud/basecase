import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { caseRobot } from '../cases/testing';
import type { DriveCommand } from '../sim/driveTypes';
import { SimEngine, type Controller } from '../sim/engine';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildMjcf, simDeltas, type WorldItem } from '../sim/mjcf';
import type { SimModel } from '../sim/mjcfTypes';
import type { PolicySpec } from '../sim/policy';
import type { Simulation } from '../sim/useSimulation';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { runSimTool } from '../workspace/agentRobotTools';
import { setWorldRequest, startDriveRequest } from './agentDrive';

const robot = (id: string) => fixtureRobots().find((r) => r.id === id)!;

interface RunOpts {
  seconds: number;
  controller: Controller;
  commands?: Array<{ at: number; command: DriveCommand }>;
  frames?: number[];
}

async function fakeContext(id: string) {
  const mj = await loadMujoco();
  const r = robot(id);
  const rig = buildRig(r.joints, r.parts);
  let world: WorldItem[] = [];
  const sim = {
    setWorld: (items: WorldItem[]) => {
      world = items;
    },
    buildModel: async () => buildMjcf({ ...caseRobot(r), rig, project: DEFAULT_PROJECT, world }),
    runOn: async (model: SimModel, { seconds, controller, commands, frames }: RunOpts) => {
      const engine = new SimEngine(mj, model);
      const due = [...(commands ?? [])];
      const shots: Array<{ t: number; deltas: ReturnType<typeof simDeltas> }> = [];

      engine.setController(controller);

      for (let t = 0; t < seconds - 1e-9; t += 0.02) {
        while (due.length && due[0].at <= t + 1e-9) engine.command(due.shift()!.command);

        engine.step(0.02);
      }

      if (frames?.length) shots.push({ t: seconds, deltas: simDeltas(model, engine.poses()) });

      const stats = engine.stats();

      engine.dispose();

      return { stats, frames: shots, model };
    },
  } as unknown as Simulation;

  return { ctx: { sim, rig, parts: r.parts }, world: () => world };
}

describe('set_world', () => {
  it('converts the agent frame and keeps objects out of parts', async () => {
    const { ctx, world } = await fakeContext('rover-diff');
    const reply = setWorldRequest(ctx, {
      objects: [{ name: 'Goal', kind: 'cylinder', position: [0, 900, 50], size: [200, 200, 100], behavior: 'marker' }],
    });

    expect(reply.text).toContain('Goal');
    expect(world()).toHaveLength(1);
    expect(world()[0].position).toEqual([0, 50, -900]);
    expect(world()[0].dimensions).toEqual({ width: 200, height: 100, depth: 200 });
    expect(world()[0].behavior).toBe('marker');
  });

  it('refuses hostile ids instead of writing them anywhere', async () => {
    const { ctx } = await fakeContext('rover-diff');

    expect(() =>
      setWorldRequest(ctx, {
        objects: [{ id: '../../x', name: 'X', kind: 'box', position: [0, 0, 0], size: [1, 1, 1], behavior: 'static' }],
      }),
    ).toThrow();
  });
});

describe('start_drive', () => {
  it('drives a rover forward headless and reports it', async () => {
    const { ctx } = await fakeContext('rover-diff');
    const reply = await startDriveRequest(ctx, { seconds: 3, commands: [{ at: 0.2, forward: 1 }] });

    expect(reply.text).toMatch(/Moved \d+ mm/);
    expect(reply.text).toContain('Stayed up.');
    expect(Number(/(\d+) mm of it forward/.exec(reply.text)?.[1])).toBeGreaterThan(200);
  });

  it('tells the agent how to get a biped walking instead of refusing', async () => {
    const { ctx } = await fakeContext('biped-servo');
    const reply = await startDriveRequest(ctx, { commands: [{ at: 0, forward: 1 }] });

    expect(reply.text).toMatch(/^Train a walking skill first: train_skill kit "walk"/);
  });

  it('drives a walker through its ready velocity skill, scaling the command to its top speed', async () => {
    const { ctx } = await fakeContext('biped-servo');
    const seen: Controller[] = [];
    const runOn = ctx.sim.runOn;
    const policy = { joints: [], command: [0, 0, 0] } as unknown as PolicySpec;
    const sim = {
      ...ctx.sim,
      runOn: (model: SimModel, opts: RunOpts) => {
        seen.push(opts.controller);
        expect(opts.commands?.[0].command.v).toEqual([0.15, 0, 0]);

        return runOn(model, { ...opts, controller: { kind: 'hold' } });
      },
    } as unknown as Simulation;
    const reply = await startDriveRequest(
      { ...ctx, sim, velocity: async () => ({ policy, topSpeed: 0.15 }) },
      { seconds: 1, commands: [{ at: 0, forward: 1 }] },
    );

    expect(seen.map((c) => c.kind)).toEqual(['policy']);
    expect(reply.text).toMatch(/^Drove 1 s as a walker/);
  });

  it('reports the end effector of an arm in the agent frame', async () => {
    const { ctx } = await fakeContext('arm-6dof');
    const reply = await startDriveRequest(ctx, { seconds: 2, commands: [{ at: 0, target: [0, 150, 300] }] });
    const [x, y, z] = /\[(-?\d+), (-?\d+), (-?\d+)\]/.exec(reply.text)!.slice(1).map(Number);

    expect(Math.hypot(x, y - 150, z - 300)).toBeLessThan(25);
  });

  it('unknown simulation tools fail instead of reporting training', async () => {
    const { ctx } = await fakeContext('rover-diff');

    await expect(
      runSimTool('simulate_everything', {}, { ...ctx, setAction: () => {} } as unknown as Parameters<
        typeof runSimTool
      >[2]),
    ).rejects.toThrow(/Unknown/);
  });
});
