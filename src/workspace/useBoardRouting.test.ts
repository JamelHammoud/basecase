import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { useBoardRouting } from './useBoardRouting';
import { DEFAULT_PROJECT } from '../types/robotics';
import type { WorkspaceCore } from './useWorkspaceCore';

const mocks = vi.hoisted(() => ({ call: vi.fn(), dispose: vi.fn(), route: vi.fn(), validate: vi.fn() }));

vi.mock('../wiring/electricalClient', () => ({
  electricalClient: () => ({ call: mocks.call, dispose: mocks.dispose }),
}));
vi.mock('../wiring/boardRouteClient', () => ({ routeNativeCopper: mocks.route }));
vi.mock('../wiring/boardNativeClient', () => ({ validateNativeBoard: mocks.validate }));
vi.mock('../three/componentMeshes', () => ({ sourcedMeshFiles: async () => ({}) }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.route.mockResolvedValue({ pcb: '(kicad_pcb)', provenance: { engine: 'freerouting' } });
  mocks.validate.mockResolvedValue({ key: 'evidence', issues: [], version: '9.0.6' });
  mocks.call.mockImplementation(async (method) => {
    if (method === 'prepareRoute') return { request: { id: 'route' }, plan: {} };

    if (method === 'importText') return { schema: 1, partId: 'board', routed: { pcb: '(kicad_pcb)' } };

    if (method === 'prepareExport') return { request: { key: 'evidence' } };

    return { schema: 1, partId: 'board', routed: { pcb: '(kicad_pcb)', evidence: { key: 'evidence' } } };
  });
});

function session() {
  const parts: WorkspaceCore['parts'] = [];
  const project = { ...DEFAULT_PROJECT };
  const commitBoard = vi.fn();
  const showToast = vi.fn();
  const dismissToast = vi.fn();
  const core = {
    parts,
    project,
    scene: { sceneId: 'original' },
    docs: { partsRef: { current: parts }, projectRef: { current: project }, commitBoard },
    showToast,
    toasts: { dismissToast },
    tool: { openRightTab: vi.fn() },
  } as unknown as WorkspaceCore;
  let route: (() => Promise<void>) | undefined;
  const Host = () => {
    route = useBoardRouting(core);

    return null;
  };

  renderToStaticMarkup(createElement(Host));

  return { core, commitBoard, showToast, dismissToast, run: () => route!() };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

it('commits a checked candidate exactly once without changing the captured parts', async () => {
  const s = session();

  await s.run();
  expect(s.commitBoard).toHaveBeenCalledOnce();
  expect(s.commitBoard.mock.calls[0][0]).toBe(s.core.parts);
  expect(s.commitBoard.mock.calls[0][1].routed.evidence.key).toBe('evidence');
  expect(mocks.validate).toHaveBeenCalledOnce();
  expect(mocks.dispose).toHaveBeenCalledOnce();
});

it.each(['parts', 'project', 'scene'])('discards a route completion after %s changes', async (change) => {
  const s = session();
  const entered = deferred<void>();
  const finish = deferred<{ pcb: string; provenance: Record<string, never> }>();

  mocks.route.mockImplementation(() => {
    entered.resolve();

    return finish.promise;
  });

  const running = s.run();

  await entered.promise;

  if (change === 'parts') s.core.docs.partsRef.current = [];

  if (change === 'project') s.core.docs.projectRef.current = { ...s.core.project, tether: { volts: 24, amps: 2 } };

  if (change === 'scene') s.core.scene.sceneId = 'other';

  finish.resolve({ pcb: '(kicad_pcb)', provenance: {} });
  await running;
  expect(s.commitBoard).not.toHaveBeenCalled();
  expect(mocks.validate).not.toHaveBeenCalled();
});

it('cancels active native work and discards its late completion', async () => {
  const s = session();
  const entered = deferred<void>();
  const finish = deferred<{ pcb: string; provenance: Record<string, never> }>();
  let signal: AbortSignal | undefined;

  mocks.route.mockImplementation((_input, activeSignal) => {
    signal = activeSignal;
    entered.resolve();

    return finish.promise;
  });

  const running = s.run();

  await entered.promise;
  s.showToast.mock.calls[0][1].action.onClick();
  expect(signal?.aborted).toBe(true);
  finish.resolve({ pcb: '(kicad_pcb)', provenance: {} });
  await running;
  expect(s.commitBoard).not.toHaveBeenCalled();
  expect(s.dismissToast).toHaveBeenCalled();
});

it('discards validation that completes after an electrical edit', async () => {
  const s = session();
  const entered = deferred<void>();
  const finish = deferred<Record<string, never>>();

  mocks.validate.mockImplementation(() => {
    entered.resolve();

    return finish.promise;
  });

  const running = s.run();

  await entered.promise;
  s.core.docs.projectRef.current = { ...s.core.project, tether: { volts: 12, amps: 2 } };
  finish.resolve({});
  await running;
  expect(s.commitBoard).not.toHaveBeenCalled();
});

it.each(['routing', 'validation', 'acceptance'])('preserves the board after %s failure', async (stage) => {
  const s = session();
  const before = s.core.docs.projectRef.current;

  if (stage === 'routing') mocks.route.mockRejectedValue(new Error('stopped'));

  if (stage === 'validation') mocks.validate.mockRejectedValue(new Error('stopped'));

  if (stage === 'acceptance')
    mocks.call.mockImplementation(async (method) => {
      if (method === 'prepareRoute') return { request: {}, plan: {} };

      if (method === 'importText') return { routed: {} };

      if (method === 'prepareExport') return { request: {} };

      throw new Error('stopped');
    });

  await s.run();
  expect(s.commitBoard).not.toHaveBeenCalled();
  expect(s.core.docs.projectRef.current).toBe(before);
});
