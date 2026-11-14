import { describe, expect, it, vi } from 'vitest';
import type { FleetTools } from '../fleet/fleetTools';
import { runSimTool, type SimToolContext } from './agentRobotTools';

function stubFleet(refusal: string | null = null) {
  return {
    select: vi.fn(() => refusal),
    rollOut: vi.fn(async () => 'Rolled out Walk: robot 32 of 32 passed.'),
    rollBack: vi.fn(async () => 'robot-2 runs its previous version.'),
  } satisfies FleetTools;
}

function context(fleet?: FleetTools) {
  const setAction = vi.fn();
  const ctx = { fleet, setAction, rig: { joints: [], robots: [] }, parts: [] } as unknown as SimToolContext;

  return { ctx, setAction };
}

describe('the agent’s fleet tools', () => {
  it('roll a skill out through the fleet with the payload and reply with its text', async () => {
    const fleet = stubFleet();
    const { ctx, setAction } = context(fleet);
    const ask = { skill: 'Walk', canaries: ['robot'], units: ['robot', 'robot-2'] };
    const reply = await runSimTool('roll_out', ask, ctx);

    expect(fleet.rollOut).toHaveBeenCalledWith(ask);
    expect(setAction).toHaveBeenCalledWith('Rolling out');
    expect(reply.text).toBe('Rolled out Walk: robot 32 of 32 passed.');
  });

  it('roll one unit back and reply with its text', async () => {
    const fleet = stubFleet();
    const { ctx, setAction } = context(fleet);
    const reply = await runSimTool('roll_back', { unit: 'robot-2' }, ctx);

    expect(fleet.rollBack).toHaveBeenCalledWith('robot-2');
    expect(setAction).toHaveBeenCalledWith('Rolling back');
    expect(reply.text).toBe('robot-2 runs its previous version.');
  });

  it('operate selects the unit first and replies with its refusal without driving', async () => {
    const fleet = stubFleet('No unit robot-9 is connected.');
    const { ctx, setAction } = context(fleet);
    const reply = await runSimTool('operate', { unit: 'robot-9' }, ctx);

    expect(fleet.select).toHaveBeenCalledWith('robot-9');
    expect(setAction).not.toHaveBeenCalled();
    expect(reply.text).toBe('No unit robot-9 is connected.');
  });

  it('operate drives once the unit is selected, and leaves the selection alone without a unit', async () => {
    const fleet = stubFleet();
    const { ctx } = context(fleet);

    expect((await runSimTool('operate', { unit: 'robot-2' }, ctx)).text).toMatch(/no joints/);
    expect(fleet.select).toHaveBeenCalledWith('robot-2');

    await runSimTool('operate', {}, ctx);

    expect(fleet.select).toHaveBeenCalledTimes(1);
  });

  it('ask for a connected robot when there is no fleet', async () => {
    const { ctx } = context();

    for (const [kind, payload] of [
      ['roll_out', { skill: 'Walk' }],
      ['roll_back', { unit: 'robot' }],
      ['operate', { unit: 'robot' }],
    ] as const)
      expect((await runSimTool(kind, payload, ctx)).text).toBe('Connect an emulated robot first.');
  });
});
