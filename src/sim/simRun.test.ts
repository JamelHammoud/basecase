import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it, vi } from 'vitest';
import { fixtureModel } from '../skills/fixtureModels';
import { SimEngine } from './engine';
import { commandTimeline, runFor, type RunRequest } from './simRun';

describe('scheduled simulation runs', () => {
  it('keeps command, push and frame timing relative to a running engine without consuming the request', async () => {
    const mj = await loadMujoco();
    const engine = new SimEngine(mj, fixtureModel('rover-diff'));
    const request: RunRequest = {
      id: 4,
      seconds: 0.08,
      pushes: [
        { at: 0.04, robot: engine.sim.robots[0].key, force: [2, 0, 0] },
        { at: 0, robot: engine.sim.robots[0].key, force: [1, 0, 0] },
      ],
      commands: [
        { at: 0.04, command: { v: [0, 0, 0] } },
        { at: 0, command: { v: [0.1, 0, 0] } },
        { at: 0.04, command: { v: [0.2, 0, 0] } },
        { at: 0.08, command: { v: [0.3, 0, 0] } },
      ],
      frames: [0.08, 0.04, 0, 0.04, 1],
    };
    const original = structuredClone(request);
    const calls: Array<{ kind: string; t: number; value: unknown }> = [];

    engine.setController({ kind: 'hold' });
    engine.step(0.1);

    const start = engine.data.time;

    vi.spyOn(engine, 'command').mockImplementation((command) => {
      calls.push({ kind: 'command', t: engine.data.time - start, value: command });
    });
    vi.spyOn(engine, 'pushRobot').mockImplementation((_robot, force) => {
      calls.push({ kind: 'push', t: engine.data.time - start, value: force });
    });

    try {
      const result = runFor(engine, request);

      expect(result.id).toBe(request.id);
      expect(result.frames.map((f) => f.t)).toEqual([0, 0.04, 0.04, 0.08]);
      expect(result.frames.every((f) => f.poses.length === engine.poses().length)).toBe(true);
      expect(calls.map((c) => [c.kind, c.value])).toEqual([
        ['push', [1, 0, 0]],
        ['command', { v: [0.1, 0, 0] }],
        ['push', [2, 0, 0]],
        ['command', { v: [0, 0, 0] }],
        ['command', { v: [0.2, 0, 0] }],
      ]);
      expect(calls.map((c) => Math.round(c.t * 1000))).toEqual([0, 0, 40, 40, 40]);
      expect(request).toEqual(original);
    } finally {
      engine.dispose();
    }
  });

  it('holds a live command script across ticks and can replace it with a fresh script', async () => {
    const mj = await loadMujoco();
    const engine = new SimEngine(mj, fixtureModel('rover-diff'));
    const command = vi.spyOn(engine, 'command');
    const entries = [
      { at: 1, command: { v: [0.2, 0, 0] as [number, number, number] } },
      { at: 0, command: { v: [0.1, 0, 0] as [number, number, number] } },
    ];

    try {
      const script = commandTimeline(engine, entries);

      script.advance(0);
      script.advance(0.5);
      script.advance(1);
      script.advance(2);
      expect(command.mock.calls.map(([c]) => c)).toEqual([entries[1].command, entries[0].command]);

      const replacement = commandTimeline(engine, entries);

      replacement.advance(0);
      expect(command).toHaveBeenCalledTimes(3);
      expect(command).toHaveBeenLastCalledWith(entries[1].command);
    } finally {
      engine.dispose();
    }
  });
});
