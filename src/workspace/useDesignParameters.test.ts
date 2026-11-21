import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { specToPart } from '../agent/agentScene';
import { platformBridge } from '../utils/platformBridge';
import { geometryWorker } from '../three/geometryWorker';
import { generatedCad } from '../utils/sketch/fixtures/supportDesigns';
import { DEFAULT_PROJECT } from '../types/robotics';
import { currentConfirm, setConfirmRequest } from '../design-system/confirmStore';
import { rememberParameterDesign } from '../utils/designParameters/verification';
import { useSceneDocument, type SceneDocument } from './useSceneDocument';
import { useDesignParameters, type DesignParameters } from './useDesignParameters';

afterEach(() => {
  vi.restoreAllMocks();
  setConfirmRequest(null);
});

function setup() {
  const part = {
    ...specToPart({
      id: 'deck',
      shape: 'cad_part',
      cad: { ...generatedCad([80, 6, 40]), code: 'width = 80;\ncube([width,40,6],center=true);' },
    }),
    dimensionBindings: [{ kind: 'cad' as const, target: 'width', unit: 'mm' as const, expression: 'width' }],
  };
  const designParameters = [{ name: 'width', unit: 'mm' as const, value: 80 }];
  let docs!: SceneDocument;
  let controls!: DesignParameters;
  const toast = vi.fn();

  rememberParameterDesign([part], designParameters);

  function Harness() {
    docs = useSceneDocument(
      {
        parts: [part],
        project: { ...DEFAULT_PROJECT, designParameters },
        sceneId: 'scene',
        sceneName: 'Rover',
        globalGoal: '',
        annotations: [],
      },
      toast,
    );
    controls = useDesignParameters({ docs, sceneId: 'scene', showToast: toast });

    return null;
  }

  renderToString(createElement(Harness));

  const compile = vi.spyOn(platformBridge, 'renderCad').mockImplementation(async (_language, code) => {
    const width = Number(/width = ([\d.]+)/.exec(code)![1]);

    return { ok: true, ...generatedCad([width, 6, 40]) };
  });

  return { docs, controls, part, designParameters, compile, toast };
}

describe('shared dimensions through scene document editing', () => {
  it('runs one worker preparation and publishes geometry and declarations in one complete undo and redo step', async () => {
    const { docs, controls, part, compile } = setup();
    const worker = vi.spyOn(geometryWorker, 'call');

    expect(await controls.apply({ op: 'set', parameter: { name: 'width', unit: 'mm', value: 100 } })).toBe(true);
    expect(compile).toHaveBeenCalledTimes(1);
    expect(worker).toHaveBeenCalledTimes(1);
    expect(docs.docRef.current.past).toHaveLength(1);
    expect(docs.docRef.current.parts[0].dimensions.width).toBe(100);
    docs.travel({ direction: 'undo' }, () => {});
    expect(docs.docRef.current.parts[0]).toBe(part);
    expect(docs.projectRef.current.designParameters![0]).toMatchObject({ value: 80 });
    docs.travel({ direction: 'redo' }, () => {});
    expect(docs.docRef.current.parts[0].dimensions.width).toBe(100);
    expect(docs.projectRef.current.designParameters![0]).toMatchObject({ value: 100 });
  });

  it('rejects compile refusal and direct edits that contradict a binding without publishing any partial state', async () => {
    const { docs, controls, part, compile, toast } = setup();

    compile.mockResolvedValue({ ok: false, error: 'Compilation refused' });
    expect(await controls.apply({ op: 'set', parameter: { name: 'width', unit: 'mm', value: 120 } })).toBe(false);
    expect(docs.docRef.current.parts[0]).toBe(part);
    expect(docs.docRef.current.past).toHaveLength(0);
    expect(docs.projectRef.current.designParameters![0]).toMatchObject({ value: 80 });
    expect(toast.mock.calls[0][0]).toMatch(/deck/);
    docs.commitParts((parts) =>
      parts.map((item) => ({ ...item, cad: { ...item.cad!, code: 'width = 99;\ncube([width,40,6]);' } })),
    );
    expect(docs.docRef.current.parts[0]).toBe(part);
    expect(toast.mock.calls.at(-1)![0]).toMatch(/differs/);
  });

  it('renames references together and requires explicit confirmed freezing before deleting an in-use declaration', async () => {
    const { docs, controls } = setup();

    expect(await controls.apply({ op: 'rename', name: 'width', to: 'chassis' })).toBe(true);
    expect(docs.docRef.current.parts[0].dimensionBindings![0].expression).toBe('chassis');
    controls.remove('chassis');
    expect(currentConfirm()).toMatchObject({ title: 'Delete chassis?', confirmLabel: 'Freeze and Delete' });
    expect(docs.projectRef.current.designParameters).toHaveLength(1);

    let finish!: () => void;
    const committed = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const original = docs.commitParameters;

    vi.spyOn(docs, 'commitParameters').mockImplementation((...args) => {
      original(...args);
      finish();
    });
    currentConfirm()!.onConfirm();
    await committed;
    expect(docs.projectRef.current.designParameters).toEqual([]);
    expect(docs.docRef.current.parts[0].dimensionBindings![0].expression).toBe('(80 mm)');
  });
});

describe('parameter preparation ownership', () => {
  it.each(['cancel', 'scene', 'undo', 'actor'] as const)('rejects a late successful compile after %s', async (mode) => {
    const { docs, controls, compile, part } = setup();

    await controls.apply({ op: 'set', parameter: { name: 'width', unit: 'mm', value: 90 } });

    let finish!: (result: { ok: true; positions: number[]; indices: number[] }) => void;
    const pendingCompile = new Promise<{ ok: true; positions: number[]; indices: number[] }>((resolve) => {
      finish = resolve;
    });

    compile.mockReturnValue(pendingCompile);

    let active = true;
    const pending = controls.apply({ op: 'set', parameter: { name: 'width', unit: 'mm', value: 100 } }, () => active);
    const actions = {
      cancel: controls.cancel,
      scene: () => docs.resetDoc([part]),
      undo: () => docs.travel({ direction: 'undo' }, () => {}),
      actor: () => {
        active = false;
      },
    };

    actions[mode]();
    finish({ ok: true, ...generatedCad([100, 6, 40]) });
    expect(await pending).toBe(false);
    expect(docs.docRef.current.parts[0].dimensions.width).toBe(mode === 'cancel' || mode === 'actor' ? 90 : 80);
  });
});

it('resolves forward declarations and bindings together, then ignores a stale delete confirmation', async () => {
  const { docs, controls, compile, toast } = setup();

  expect(
    await controls.apply([
      { op: 'bind', part: 'deck', binding: { kind: 'cad', target: 'width', unit: 'mm', expression: 'span' } },
      { op: 'set', parameter: { name: 'span', unit: 'mm', expression: 'base + 20 mm' } },
      { op: 'set', parameter: { name: 'base', unit: 'mm', value: 80 } },
    ]),
  ).toBe(true);
  expect(compile).toHaveBeenCalledTimes(1);
  expect(docs.docRef.current.past).toHaveLength(1);
  expect(docs.docRef.current.parts[0].dimensions.width).toBe(100);
  controls.remove('span');
  docs.commitParts((parts) => parts.map((part) => ({ ...part, note: 'Changed after confirmation opened' })));
  currentConfirm()!.onConfirm();
  expect(docs.projectRef.current.designParameters!.some((parameter) => parameter.name === 'span')).toBe(true);
  expect(toast.mock.calls.at(-1)![0]).toMatch(/changed/);
});

it('keeps renamed and frozen dimensions verified across undo without rebuilding their geometry', async () => {
  const { docs, controls, part, compile } = setup();

  expect(await controls.apply({ op: 'rename', name: 'width', to: 'span' })).toBe(true);
  expect(docs.docRef.current.parts[0].cad).toBe(part.cad);
  expect(compile).not.toHaveBeenCalled();
  docs.travel({ direction: 'undo' }, () => {});
  expect(docs.docRef.current.parts[0]).toBe(part);
  expect(compile).not.toHaveBeenCalled();
});

it('refuses ordinary scaling of bound CAD geometry without a history entry and still permits placement', () => {
  const { docs, part, toast } = setup();

  docs.commitParts((parts) => parts.map((item) => ({ ...item, dimensions: { ...item.dimensions, width: 120 } })));
  expect(docs.docRef.current.parts[0]).toBe(part);
  expect(docs.docRef.current.past).toHaveLength(0);
  expect(toast).toHaveBeenCalledWith('Edit the shared parameter or unbind this dimension.');
  docs.commitParts((parts) => parts.map((item) => ({ ...item, position: [10, 20, 30] })));
  expect(docs.docRef.current.parts[0].position).toEqual([10, 20, 30]);
  expect(docs.docRef.current.past).toHaveLength(1);
});

it('lets the latest concurrent edit publish while discarding an earlier successful compile', async () => {
  const { docs, controls, compile } = setup();
  let finish!: (result: { ok: true; positions: number[]; indices: number[] }) => void;

  compile.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );

  const first = controls.apply({ op: 'set', parameter: { name: 'width', unit: 'mm', value: 100 } });
  const second = controls.apply({ op: 'set', parameter: { name: 'width', unit: 'mm', value: 120 } });

  expect(await second).toBe(true);
  finish({ ok: true, ...generatedCad([100, 6, 40]) });
  expect(await first).toBe(false);
  expect(docs.docRef.current.parts[0].dimensions.width).toBe(120);
  expect(docs.docRef.current.past).toHaveLength(1);
});

it('exposes the same atomic edit and compact declarations through the existing agent request handlers', async () => {
  const { requestHandler } = await import('./agentRequestHandlers');
  const { docs, controls, compile } = setup();
  const context = {
    editParameters: controls.apply,
    parts: () => docs.docRef.current.parts,
    project: () => docs.projectRef.current,
    viewport: () => null,
    cases: { cases: [] },
  } as unknown as import('./agentRequestHandlers').RequestContext;
  const result = await requestHandler('apply')!(
    { parameterEdits: [{ op: 'set', parameter: { name: 'width', unit: 'mm', value: 200 } }] },
    context,
    'apply',
  );
  const snapshot = (await requestHandler('snapshot')!({}, context, 'snapshot')) as {
    parameters: unknown[];
    parts: Array<{ dimensions: unknown[] }>;
  };

  expect(result).toMatchObject({ ok: true });
  expect(compile).toHaveBeenCalledTimes(1);
  expect(docs.docRef.current.past).toHaveLength(1);
  expect(snapshot.parameters).toEqual([{ name: 'width', unit: 'mm', value: 200 }]);
  expect(snapshot.parts[0].dimensions).toEqual([{ kind: 'cad', target: 'width', unit: 'mm', expression: 'width' }]);
  await expect(
    requestHandler('apply')!({ parameterEdits: [{ op: 'insert', parts: [] }] }, context, 'apply'),
  ).rejects.toThrow(/supported parameter edits/);
});

it('rejects a late native reply after dimensional requirements change without replacing geometry', async () => {
  const { docs, controls, compile, part } = setup();
  const requirement = {
    name: 'width_limit',
    expression: 'width',
    minimum: 0,
    maximum: 120,
    dimensions: [{ parameter: 'width', part: 'deck', kind: 'cad' as const, target: 'width' }],
  };

  docs.updateProjectNow((project) => ({ ...project, dimensionalRequirements: [requirement] }));

  let finish!: (result: { ok: true; positions: number[]; indices: number[] }) => void;

  compile.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );

  const pending = controls.apply({
    op: 'set',
    parameter: { name: 'width', unit: 'mm', value: 100, tolerance: { lower: -0.1, upper: 0.2 } },
  });

  docs.updateProjectNow((project) => ({ ...project, dimensionalRequirements: [{ ...requirement, maximum: 90 }] }));
  finish({ ok: true, ...generatedCad([100, 6, 40]) });
  expect(await pending).toBe(false);
  expect(docs.docRef.current.parts[0]).toBe(part);
  expect(docs.docRef.current.past).toHaveLength(0);
  expect(docs.projectRef.current.dimensionalRequirements![0].maximum).toBe(90);
});
