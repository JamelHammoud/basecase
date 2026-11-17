import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { useSchematicExport } from './useSchematicExport';
import type { WorkspaceCore } from './useWorkspaceCore';

const mocks = vi.hoisted(() => ({ export: vi.fn(), download: vi.fn() }));

vi.mock('./schematicExport', () => ({ schematicExport: mocks.export }));
vi.mock('../utils/downloadBytes', () => ({ downloadBytes: mocks.download }));

it('refreshes export evidence without creating a history entry or overwriting a newer board', async () => {
  const board = { routed: { pcb: 'editable' } };
  const project = { electronicsBoard: board };
  const commitBoard = vi.fn();
  const updateProjectNow = vi.fn();
  const validation = { key: 'current', version: '9.0.6', issues: [], report: '{}', metrics: {} };
  const core = {
    project,
    scene: { sceneName: 'Carrier' },
    docs: { commitBoard, updateProjectNow },
    showToast: vi.fn(),
    toasts: { dismissToast: vi.fn() },
  } as unknown as WorkspaceCore;
  let run!: () => Promise<void>;

  mocks.export.mockResolvedValue({ bytes: new Uint8Array(), validation });

  function Host() {
    run = useSchematicExport(core);

    return null;
  }

  renderToStaticMarkup(createElement(Host));
  await run();
  expect(mocks.download).toHaveBeenCalled();
  expect(commitBoard).not.toHaveBeenCalled();
  expect(updateProjectNow).toHaveBeenCalledOnce();

  const apply = updateProjectNow.mock.calls[0][0];
  const changed = { electronicsBoard: { routed: { pcb: 'newer' } } };

  expect(apply(project).electronicsBoard.routed).toEqual({ pcb: 'editable', evidence: validation });
  expect(apply(changed)).toBe(changed);
});
