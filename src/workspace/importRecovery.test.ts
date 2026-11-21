import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { plateTriangles, sheetPart } from '../sheet/sheet.fixtures';
import { stepDerivedPart } from '../utils/sketch/importRecovery.fixtures';
import { recoverImportedSketch } from '../utils/sketch/importRecovery';
import { recoveryInput } from '../utils/sketch/recoverySource';
import { recoverImportAsync } from '../utils/sketch/recoveryWorker';
import { DEFAULT_PROJECT, type ScenePart } from '../types/robotics';
import { validateRecoveryReferences } from './importRecoveryReferences';
import { useImportRecovery } from './useImportRecovery';
import type { ToastOptions } from './types';

class RecoveryWorker {
  static readonly instances: RecoveryWorker[] = [];
  static readonly behavior = { failPost: false };
  static get latest() {
    return this.instances.at(-1)!;
  }
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn(() => {
    if (RecoveryWorker.behavior.failPost) throw new Error('Cannot clone');
  });
  constructor() {
    RecoveryWorker.instances.push(this);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  RecoveryWorker.behavior.failPost = false;
});

function session(source: ScenePart) {
  const partsRef = { current: [source] };
  const projectRef = { current: DEFAULT_PROJECT };
  const commitParts = vi.fn((update: (parts: ScenePart[]) => ScenePart[]) => {
    partsRef.current = update(partsRef.current);
  });
  const showToast = vi.fn<(message: string, options?: ToastOptions) => void>();
  const dismissToast = vi.fn();
  const captureVersion = vi.fn(async () => {});
  let controls!: ReturnType<typeof useImportRecovery>;

  function Host() {
    controls = useImportRecovery({
      parts: partsRef.current,
      project: projectRef.current,
      partsRef,
      projectRef,
      commitParts,
      showToast,
      dismissToast,
      captureVersion,
    });

    return null;
  }

  renderToStaticMarkup(createElement(Host));

  return { controls, partsRef, projectRef, commitParts, showToast, dismissToast, captureVersion };
}

describe('import recovery worker and atomic scene application', () => {
  it('terminates on success, refusal, worker failure and cancellation without an interaction-thread fallback', async () => {
    vi.stubGlobal('Worker', RecoveryWorker);

    const source = {
      ...stepDerivedPart(plateTriangles()),
      note: 'Retained source',
      printMaterial: 'PETG' as const,
      group: { id: 'assembly', name: 'Assembly' },
    };
    const abort = new AbortController();
    const result = recoverImportedSketch(source);
    const pending = recoverImportAsync(source, abort.signal);
    const worker = RecoveryWorker.latest;

    expect(worker.postMessage).toHaveBeenCalledWith(recoveryInput(source));
    worker.onmessage!({ data: { result: { ...result, part: { ...result.part, mesh: undefined } } } });
    await expect(pending).resolves.toEqual(result);
    expect(worker.terminate).toHaveBeenCalledOnce();

    const refused = recoverImportAsync(source, abort.signal);

    RecoveryWorker.latest.onmessage!({ data: { error: 'unsupported' } });
    await expect(refused).rejects.toThrow('unsupported');
    expect(RecoveryWorker.latest.terminate).toHaveBeenCalledOnce();

    const failed = recoverImportAsync(source, abort.signal);

    RecoveryWorker.latest.onerror!({ message: 'failed' });
    await expect(failed).rejects.toThrow('failed');
    expect(RecoveryWorker.latest.terminate).toHaveBeenCalledOnce();

    const cancelled = recoverImportAsync(source, abort.signal);

    abort.abort();
    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
    expect(RecoveryWorker.latest.terminate).toHaveBeenCalledOnce();
    await expect(recoverImportAsync(source, abort.signal)).rejects.toMatchObject({ name: 'AbortError' });

    RecoveryWorker.behavior.failPost = true;

    const uncloneable = recoverImportAsync(source, new AbortController().signal);

    await expect(uncloneable).rejects.toThrow('Cannot clone');
    expect(RecoveryWorker.latest.terminate).toHaveBeenCalledOnce();
  });

  it.each(['current', 'edited', 'project', 'cancelled', 'during-save'])(
    'applies one edit only for the submitted current scene: %s',
    async (state) => {
      vi.stubGlobal('Worker', RecoveryWorker);

      const source = stepDerivedPart(plateTriangles());
      const fixture = session(source);
      const pending = fixture.controls.convert(source.id);
      const worker = RecoveryWorker.latest;
      const result = recoverImportedSketch(source);

      if (state === 'edited') fixture.partsRef.current = [source, sheetPart({ id: 'other' })];

      if (state === 'project') fixture.projectRef.current = { ...DEFAULT_PROJECT, material: 'ABS' };

      if (state === 'during-save')
        fixture.captureVersion.mockImplementationOnce(async () => {
          fixture.partsRef.current = [source, sheetPart({ id: 'other' })];
        });

      if (state === 'cancelled') fixture.showToast.mock.calls[0][1]!.action!.onClick();

      worker.onmessage!({ data: { result } });
      await pending;
      expect(fixture.commitParts).toHaveBeenCalledTimes(state === 'current' ? 1 : 0);
      expect(fixture.partsRef.current[0].id).toBe(source.id);
      expect(fixture.partsRef.current[0].kind).toBe(state === 'current' ? 'custom_model' : 'mesh');
    },
  );
});

it('refuses dependent faces, local joint frames, cable anchors, board hosts and mates before starting a worker', () => {
  const source = stepDerivedPart(plateTriangles());
  const dependent = { ...sheetPart({ id: 'dependent' }), sketch: { support: { partId: source.id } } } as ScenePart;
  const mate = {
    ...sheetPart({ id: 'mate' }),
    mates: [{ port: 'a', target: source.id, targetPort: 'b', type: 'face' as const }],
  };

  expect(() => validateRecoveryReferences([source, dependent], source, DEFAULT_PROJECT)).toThrow();
  expect(() => validateRecoveryReferences([source, mate], source, DEFAULT_PROJECT)).toThrow();
  expect(() =>
    validateRecoveryReferences([source], source, {
      ...DEFAULT_PROJECT,
      electronicsBoard: {
        schema: 1,
        partId: source.id,
        outline: 'rectangle',
        side: 'top',
        heightMm: { top: 10, bottom: 0 },
        edgeClearanceMm: 1,
        holes: [],
        keepouts: [],
        placements: [],
      },
    }),
  ).toThrow();
  expect(() =>
    validateRecoveryReferences([source], source, {
      ...DEFAULT_PROJECT,
      wiring: [
        {
          from: { partId: 'servo', port: 'a' },
          to: { partId: 'board', port: 'b' },
          anchors: [{ partId: source.id, position: [0, 0, 0] }],
        },
      ],
    }),
  ).toThrow();
  expect(() =>
    validateRecoveryReferences([source], source, {
      ...DEFAULT_PROJECT,
      joints: [
        {
          id: 'hinge',
          name: 'Hinge',
          type: 'revolute',
          parent: [source.id],
          child: ['arm'],
          origin: [0, 0, 0],
          axis: [0, 1, 0],
          frame: { part: source.id, origin: [0, 0, 0], axis: [0, 1, 0] },
        },
      ],
    }),
  ).toThrow();
  expect(() =>
    validateRecoveryReferences([source], source, {
      ...DEFAULT_PROJECT,
      joints: [
        {
          id: 'hinge',
          name: 'Hinge',
          type: 'revolute',
          parent: [source.id],
          child: ['arm'],
          origin: [0, 0, 0],
          axis: [0, 1, 0],
        },
      ],
    }),
  ).not.toThrow();
});

it('refuses selected boolean operands and duplicate identities before starting geometry work', async () => {
  vi.stubGlobal('Worker', RecoveryWorker);

  const source = stepDerivedPart(plateTriangles());
  const fixture = session(source);
  const previousWorkers = RecoveryWorker.instances.length;

  fixture.partsRef.current = [
    sheetPart({
      id: 'combined',
      kind: 'boolean',
      boolean: { op: 'union', operands: [source, sheetPart({ id: 'other' })] },
    }),
  ];
  await fixture.controls.convert(source.id);
  expect(fixture.showToast).toHaveBeenLastCalledWith('Choose an imported custom mesh.', { tone: 'error' });
  expect(fixture.commitParts).not.toHaveBeenCalled();
  expect(RecoveryWorker.instances).toHaveLength(previousWorkers);
  expect(() => validateRecoveryReferences([source, { ...source }], source, DEFAULT_PROJECT)).toThrow();
});
