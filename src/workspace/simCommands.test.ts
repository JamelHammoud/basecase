import { describe, expect, it, vi } from 'vitest';
import type { SimStatus } from '../sim/useSimulation';
import type { CommandInputs } from './sceneCommands';
import { simCommands } from './simCommands';

function simulationCommands(status: SimStatus, hasRig = true) {
  const start = vi.fn(async () => {});
  const stop = vi.fn();
  const openRightTab = vi.fn();
  const inputs = {
    core: {
      posing: { hasRig },
      simTraining: { sim: { status, start, stop } },
      tool: { openRightTab },
      dataLayers: { rows: () => [] },
    },
  } as unknown as CommandInputs;

  return { commands: simCommands(inputs), start, stop, openRightTab };
}

describe('simulation commands', () => {
  it('opens Simulate and starts from the palette', () => {
    const { commands, start, stop, openRightTab } = simulationCommands('off');

    expect(commands.map((command) => command.label)).toEqual(['Simulate']);
    commands[0].run();
    expect(openRightTab).toHaveBeenCalledExactlyOnceWith('sim');
    expect(start).toHaveBeenCalledOnce();
    expect(stop).not.toHaveBeenCalled();
  });

  it.each<SimStatus>(['loading', 'ready', 'error'])('stops from the palette while %s', (status) => {
    const { commands, start, stop, openRightTab } = simulationCommands(status);

    expect(commands.map((command) => command.label)).toEqual(['Stop Simulation']);
    commands[0].run();
    expect(stop).toHaveBeenCalledOnce();
    expect(start).not.toHaveBeenCalled();
    expect(openRightTab).not.toHaveBeenCalled();
  });

  it('omits simulation commands without a movable joint', () => {
    expect(simulationCommands('off', false).commands).toEqual([]);
  });
});
