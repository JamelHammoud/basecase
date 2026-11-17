import { beforeEach, expect, it, vi } from 'vitest';
import { inspectElectrical } from './electricalChecks';
import { component, sceneOf } from './fixtures';
import { defineBoard } from './boardDefinition';

const mocks = vi.hoisted(() => ({ status: vi.fn(), call: vi.fn(), dispose: vi.fn() }));

vi.mock('../utils/platform/channelCall', () => ({ channelCall: mocks.status }));
vi.mock('./electricalClient', () => ({
  electricalClient: () => ({ call: mocks.call, dispose: mocks.dispose }),
}));
vi.mock('../three/componentMeshes', () => ({ sourcedMeshFiles: async () => ({}) }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.call.mockResolvedValue({ board: {}, requirements: [] });
});

it.each([true, false])('keeps missing local tools as an existing electrical finding: %s', async (available) => {
  const scene = sceneOf([component('adapter', 'robotis-u2d2')], []);
  const { board, part } = defineBoard(scene, 'board');
  const input = {
    parts: [...scene.parts, part],
    project: {
      ...scene.project,
      electronicsBoard: { ...board, routing: { source: '' } as NonNullable<typeof board.routing> },
    },
  };

  mocks.status.mockResolvedValue({ issues: available ? [] : ['board-router'] });

  const result = await inspectElectrical(input);

  expect(result.findings).toHaveLength(available ? 0 : 1);

  if (!available) expect(result.findings[0].agentText).toContain('Install the local board routing tools');

  expect(mocks.dispose).toHaveBeenCalledOnce();
});

it('does not claim tools are missing when their status call fails', async () => {
  const scene = sceneOf([component('adapter', 'robotis-u2d2')], []);
  const { board, part } = defineBoard(scene, 'board');

  mocks.status.mockRejectedValue(new Error('board-validation'));

  const result = await inspectElectrical({
    parts: [...scene.parts, part],
    project: {
      ...scene.project,
      electronicsBoard: { ...board, routing: { source: '' } as NonNullable<typeof board.routing> },
    },
  });

  expect(result.findings).toEqual([]);
});
