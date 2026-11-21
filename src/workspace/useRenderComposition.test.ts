import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { compositionJobs } from '../three/composition/client';
import type { CompositionOutput } from '../three/composition/render';
import { defaultComposition } from '../three/composition/settings';
import { box } from '../sim/fixtures/parts';
import { DEFAULT_PROJECT } from '../types/robotics';
import { downloadBytes } from '../utils/downloadBytes';
import { useRenderComposition, type RenderComposition } from './useRenderComposition';
import type { WorkspaceCore } from './useWorkspaceCore';

vi.mock('../utils/downloadBytes', () => ({ downloadBytes: vi.fn() }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function session() {
  const parts = [box('arm', [0, 0, 0], [20, 80, 20], 10)];
  const project = { ...DEFAULT_PROJECT, rendering: defaultComposition() };
  const core = {
    parts,
    project,
    docs: { partsRef: { current: parts }, projectRef: { current: project }, updateProjectNow: vi.fn() },
    scene: { sceneId: 'arm', sceneName: 'Finished arm' },
    active: true,
    viewportRef: {
      current: {
        renderPose: () => ({ arm: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 20, 0, 0, 1] }),
        onRender: vi.fn(() => vi.fn()),
      },
    },
    showToast: vi.fn(),
  } as unknown as WorkspaceCore;
  const result: { current?: RenderComposition } = {};
  const Host = () => {
    result.current = useRenderComposition(core);

    return null;
  };

  renderToStaticMarkup(createElement(Host));

  return { core, composition: result.current! };
}

const output = (): CompositionOutput => ({
  png: new Blob(['png'], { type: 'image/png' }),
  view: defaultComposition().view,
  metrics: {
    preparationMs: 1,
    renderMs: 1,
    encodingMs: 1,
    geometries: 1,
    textures: 0,
    decodedPixels: 0,
    outputBytes: 3,
    pixelBytes: 8,
    drawCalls: 1,
  },
});

it('exports the captured revision and pose through the actual download helper', async () => {
  const { core, composition } = session();
  const run = vi.spyOn(compositionJobs, 'run').mockResolvedValue(output());

  await composition.run('export');
  expect(run.mock.calls[0][0].snapshot.parts).toBe(core.parts);
  expect(run.mock.calls[0][0].snapshot.pose.arm[12]).toBe(20);
  expect(downloadBytes).toHaveBeenCalledWith(new Uint8Array([112, 110, 103]), 'finished-arm.png', 'image/png');
  expect(core.showToast).toHaveBeenCalledWith('Exported image');
});

it('rechecks the source after reading encoded bytes before starting the download', async () => {
  const { core, composition } = session();
  const result = output();

  vi.spyOn(result.png, 'arrayBuffer').mockImplementation(async () => {
    core.docs.partsRef.current = [];

    return new ArrayBuffer(3);
  });
  vi.spyOn(compositionJobs, 'run').mockResolvedValue(result);
  await composition.run('export');
  expect(downloadBytes).not.toHaveBeenCalled();
});

it.each(['edit', 'pose', 'live-pose', 'joints', 'switch', 'close', 'settings'] as const)(
  'refuses delivery after a source %s while rendering',
  async (change) => {
    const { core, composition } = session();
    let resolve: (result: CompositionOutput) => void = () => {};

    vi.spyOn(compositionJobs, 'run').mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );

    const running = composition.run('export');

    if (change === 'edit') core.docs.partsRef.current = [];

    if (change === 'pose') core.docs.projectRef.current = { ...core.project, pose: { values: { elbow: 30 } } };

    if (change === 'live-pose') core.viewportRef.current!.renderPose = () => ({});

    if (change === 'joints') core.docs.projectRef.current = { ...core.project, joints: [] };

    if (change === 'switch') core.scene.sceneId = 'other-scene';

    if (change === 'close') composition.close();

    if (change === 'settings')
      core.docs.projectRef.current = { ...core.project, rendering: { ...defaultComposition(), lighting: 2 } };

    resolve(output());
    await running;
    expect(downloadBytes).not.toHaveBeenCalled();
    expect(core.showToast).not.toHaveBeenCalled();
  },
);

it('cancels a pending render when viewport-only animation changes the captured pose', async () => {
  const { core, composition } = session();
  const run = vi.spyOn(compositionJobs, 'run').mockResolvedValue(output());
  const unsubscribe = vi.fn();
  let rendered = () => {};

  vi.mocked(core.viewportRef.current!.onRender).mockImplementation((listener) => {
    rendered = listener;

    return unsubscribe;
  });

  const pending = composition.run('export');

  core.viewportRef.current!.renderPose = () => ({});
  rendered();
  expect(run.mock.calls[0][1].aborted).toBe(true);
  await pending;
  expect(downloadBytes).not.toHaveBeenCalled();
  expect(unsubscribe).toHaveBeenCalledOnce();
});

it('keeps an export current when selection reveals extra operand pose helpers', async () => {
  const { core, composition } = session();
  const pose = core.viewportRef.current!.renderPose();

  vi.spyOn(compositionJobs, 'run').mockImplementation(async () => {
    core.viewportRef.current!.renderPose = () => ({ ...pose, operand: pose.arm });

    return output();
  });
  await composition.run('export');
  expect(downloadBytes).toHaveBeenCalledOnce();
});
