import { describe, expect, it, vi } from 'vitest';
import { box } from '../sim/fixtures/parts';
import { DEFAULT_PROJECT, type ScenePart } from '../types/robotics';
import { buildCommands } from './buildCommands';
import type { CommandInputs } from './sceneCommands';

function commandsFor(parts: ScenePart[], frozen = false, state = { busy: false, opening: false }) {
  const open = vi.fn();
  const generate = vi.fn();
  const importPhotos = vi.fn();
  const inputs = {
    core: {
      parts,
      project: DEFAULT_PROJECT,
      printing: { measures: {} },
      readiness: { current: null, fingerprint: '' },
      guide: { record: null, progress: null, generate },
      buildAlong: { open, frozen, opening: state.opening, photos: { busy: state.busy, importPhotos } },
    },
  } as unknown as CommandInputs;

  return { commands: buildCommands(inputs), open, generate, importPhotos };
}

it('imports photos from the palette only while an idle frozen build is open', () => {
  const { commands, importPhotos } = commandsFor([], true);

  commands.find((entry) => entry.id === 'import-build-photos')!.run();
  expect(importPhotos).toHaveBeenCalledOnce();
  expect(commandsFor([]).commands.map((entry) => entry.id)).not.toContain('import-build-photos');

  for (const state of [
    { busy: true, opening: false },
    { busy: false, opening: true },
  ])
    expect(commandsFor([], true, state).commands.map((entry) => entry.id)).not.toContain('import-build-photos');
});

it('offers purchasing only for the editable scene that mounts its sheet', () => {
  expect(commandsFor([]).commands.map((command) => command.id)).toContain('supplier-offers');
  expect(commandsFor([], true).commands.map((command) => command.id)).not.toContain('supplier-offers');
});

describe('Build Along command', () => {
  const part = box('base', [0, 0, 0], [20, 20, 20], 50);

  it('opens playback from the palette without separately generating a guide', () => {
    const { commands, open, generate } = commandsFor([part]);
    const command = commands.find((entry) => entry.id === 'build-along');

    expect(command?.label).toBe('Build Along');
    command!.run();
    expect(open).toHaveBeenCalledOnce();
    expect(generate).not.toHaveBeenCalled();
  });

  it.each([{ parts: [] }, { parts: [{ ...part, visible: false }] }, { parts: [{ ...part, role: 'cutout' as const }] }])(
    'omits playback when the scene has no built parts: %j',
    ({ parts }) => {
      expect(commandsFor(parts).commands.map((command) => command.id)).not.toContain('build-along');
    },
  );
});
