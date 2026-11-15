import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { Case } from '../cases/schema';
import { meshWorldAsset } from '../cases/worldAssets.fixtures';
import { registerWorldAsset } from '../cases/worldAssets';
import type { CameraTilesInput } from '../components/cameras/useCameraTiles';
import type { WorkspaceActions } from './useWorkspaceActions';
import type { WorkspaceCore } from './useWorkspaceCore';
import { CaseRunProvider } from './CaseRunProvider';

const tiles = vi.hoisted(() => vi.fn((_input: CameraTilesInput) => ({ views: [] })));

vi.mock('../components/cameras/useCameraTiles', () => ({ useCameraTiles: tiles }));
vi.mock('./useConsoleSignals', () => ({ useConsoleSignals: () => ({}) }));
vi.mock('./useRecordedSignals', () => ({ useRecordedSignals: () => null }));

it.each([false, true])('uses the displayed Case world with playback=%s', (playback) => {
  const asset = meshWorldAsset();
  const hash = 'a'.repeat(64);
  const position: [number, number, number] = [100, 0, -200];
  const captured = { world: { imported: { hash, position } } } as Case;
  const selected = { world: {} } as Case;

  registerWorldAsset(hash, asset);

  const core = {
    parts: [],
    posing: { rig: {} },
    simTraining: {
      sim: { drive: { active: false } },
      cases: {
        active: playback ? selected : captured,
        timeline: { scene: playback ? { kase: captured } : null },
        attempt: { phase: 'idle' },
      },
    },
    caseRun: { open: false, playback, kase: playback ? selected : captured, caseConsole: { panels: [] } },
  } as unknown as WorkspaceCore;
  const actions = { cameras: {}, edits: {} } as unknown as WorkspaceActions;

  renderToString(createElement(CaseRunProvider, { core, actions, children: null }));
  expect(tiles).toHaveBeenLastCalledWith(expect.objectContaining({ imported: { hash, position, asset } }));
});
