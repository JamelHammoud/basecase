import { describe, expect, it, vi } from 'vitest';
import { caseCommands } from './caseCommands';
import type { CommandInputs } from './sceneCommands';

describe('Study commands without joints', () => {
  it.each([false, true])('offers its action while running is %s', (running) => {
    const show = vi.fn();
    const stop = vi.fn();
    const inputs = {
      core: {
        posing: { hasRig: false },
        simTraining: { cases: { images: { canMake: false } } },
        study: { available: true, running, show, stop },
      },
    } as unknown as CommandInputs;
    const commands = caseCommands(inputs);

    expect(commands.map((command) => command.label)).toEqual([running ? 'Stop Study' : 'Study']);
    commands[0].run();
    expect(running ? stop : show).toHaveBeenCalledOnce();
  });
});
