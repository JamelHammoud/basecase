import type { Page } from 'playwright-core';
import { guideHtml } from '../src/guide/doc/guideDocument';
import { buildGuidePlan } from '../src/guide/guidePlan';
import { approximateScene } from '../src/guide/guideScene';
import type { GuideDrawings } from '../src/guide/render/guideDrawings';
import type { GuideJob, RenderedGuide } from '../src/guide/renderGuide';

const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';

export function kitGuideReply(job: GuideJob): RenderedGuide {
  const plan = buildGuidePlan(
    { ...approximateScene(job.title, job.parts, job.project.joints ?? []), order: job.order },
    job.project.material,
  );
  const drawing = { dataUrl: PIXEL, width: 128, height: 128, arrows: [], points: [] };
  const drawings: GuideDrawings = {
    cover: drawing,
    items: Object.fromEntries(plan.items.map((item) => [item.key, { thumb: drawing }])),
    modules: Object.fromEntries(plan.modules.map((module) => [module.id, drawing])),
    steps: plan.steps.map(() => ({ main: drawing, view: 'front' })),
  };
  const document = guideHtml({
    plan,
    drawings,
    meta: {
      title: job.title,
      material: job.project.material,
      infillPct: job.project.infillPct,
      date: job.date,
      mark: job.mark,
    },
  });

  return { ...document, plan, coverDataUrl: PIXEL };
}

function guideWorkerFixture() {
  const scope = self as unknown as DedicatedWorkerGlobalScope;

  scope.onmessage = async ({ data }: MessageEvent<{ id: number; op: string; payload: { job: GuideJob } }>) => {
    try {
      if (data.op !== 'render') throw new Error('Expected guide rendering.');

      const response = await fetch('/__kit-guide', { method: 'POST', body: JSON.stringify(data.payload.job) });

      if (!response.ok) throw new Error(await response.text());

      scope.postMessage({ id: data.id, result: await response.json() });
    } catch (error) {
      scope.postMessage({ id: data.id, error: String(error) });
    }
  };
}

export async function stubKitGuideWorker(page: Page) {
  const rendered: Array<{ job: GuideJob; result: RenderedGuide }> = [];

  await page.context().route(/\/guide\.worker[.-].*(?:\?|$)/, (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      headers: { 'Cross-Origin-Embedder-Policy': 'credentialless' },
      body: `(${guideWorkerFixture.toString()})()`,
    }),
  );
  await page.context().route('**/__kit-guide', async (route) => {
    const job = route.request().postDataJSON() as GuideJob;
    const result = kitGuideReply(job);

    rendered.push({ job, result });
    await route.fulfill({ json: result });
  });

  return rendered;
}
