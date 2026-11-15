import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bracket } from '../assembly/assembly.fixtures';
import { buildGuidePlan } from '../guide/guidePlan';
import { approximateScene } from '../guide/guideScene';
import { renderGuide, type RenderedGuide } from '../guide/renderGuide';
import { DEFAULT_PROJECT } from '../types/robotics';
import { platformBridge } from '../utils/platformBridge';
import { useBuildGuide, type BuildGuide } from './useBuildGuide';

vi.mock('../guide/renderGuide', () => ({ renderGuide: vi.fn() }));

afterEach(() => vi.restoreAllMocks());

function fixture() {
  const parts = bracket();
  const projectRef = { current: { ...DEFAULT_PROJECT } };
  const options = {
    sceneName: 'Repair arm',
    parts,
    project: projectRef.current,
    partsRef: { current: parts },
    projectRef,
    updateProjectNow: (patch) => (projectRef.current = patch(projectRef.current)),
    showToast: vi.fn(),
    viewportRef: { current: null },
  } satisfies Parameters<typeof useBuildGuide>[0];
  let guide!: BuildGuide;

  function Harness() {
    guide = useBuildGuide(options);

    return null;
  }

  renderToStaticMarkup(createElement(Harness));
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<svg></svg>'));
  vi.spyOn(platformBridge, 'saveGuide').mockResolvedValue({ ok: true });

  const plan = buildGuidePlan(approximateScene(options.sceneName, parts, []), DEFAULT_PROJECT.material);
  const rendered: RenderedGuide = { plan, html: '<html></html>', pages: 3, coverDataUrl: '' };
  let finish!: (value: RenderedGuide | null) => void;
  const drawing = new Promise<RenderedGuide | null>((resolve) => (finish = resolve));

  vi.mocked(renderGuide).mockImplementation(async (_job, events) => {
    events.onPlan?.(plan);

    return drawing;
  });

  return { guide, options, plan, rendered, finish };
}

describe('interactive guide plans', () => {
  it('shares the measured plan before PDF drawing finishes and still saves the complete guide', async () => {
    const { guide, options, plan, rendered, finish } = fixture();
    const pdf = guide.generate({ quiet: true });
    const first = guide.currentPlan({ beforePdf: true });
    const second = guide.currentPlan({ beforePdf: true });

    expect(await first).toEqual(plan);
    expect(await second).toEqual(plan);
    expect(await guide.currentPlan({ beforePdf: true })).toEqual(plan);
    expect(renderGuide).toHaveBeenCalledOnce();
    expect(platformBridge.saveGuide).not.toHaveBeenCalled();
    expect(options.projectRef.current.buildGuide).toBeUndefined();

    const completed = vi.fn();
    const completePlan = guide.currentPlan().then((value) => {
      completed();

      return value;
    });

    await guide.currentPlan({ beforePdf: true });
    expect(completed).not.toHaveBeenCalled();
    finish(rendered);

    const result = await pdf;

    expect(result?.plan).toEqual(plan);
    expect(await completePlan).toEqual(plan);
    expect(platformBridge.saveGuide).toHaveBeenCalledExactlyOnceWith({ id: result?.record.id, html: rendered.html });
    expect(options.projectRef.current.buildGuide).toEqual(result?.record);
  });

  it('settles every waiting caller when generation fails before measuring a plan', async () => {
    const { guide } = fixture();

    vi.mocked(renderGuide).mockRejectedValueOnce(new Error('Measurement failed'));

    const first = guide.currentPlan({ beforePdf: true });
    const second = guide.currentPlan({ beforePdf: true });

    expect(await first).toBeNull();
    expect(await second).toBeNull();
    expect(platformBridge.saveGuide).not.toHaveBeenCalled();
  });

  it('does not publish or save a plan arriving after cancellation', async () => {
    const { guide, plan, rendered } = fixture();

    vi.mocked(renderGuide).mockImplementationOnce(async (_job, events) => {
      guide.cancel();
      events.onPlan?.(plan);

      return rendered;
    });

    const pending = guide.currentPlan({ beforePdf: true });

    expect(await pending).toBeNull();
    expect(platformBridge.saveGuide).not.toHaveBeenCalled();
  });
});
