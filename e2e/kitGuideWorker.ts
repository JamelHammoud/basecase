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
    {
      ...approximateScene(job.title, job.parts, job.project.joints ?? []),
      boardPartId: job.project.electronicsBoard?.partId,
      order: job.order,
    },
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
  const original = scope.onmessage;

  scope.onmessage = async (event: MessageEvent<{ id: number; op: string; payload: { job: GuideJob } }>) => {
    const { data } = event;

    if (data.op !== 'render') {
      await original?.call(scope, event);

      return;
    }

    try {
      const response = await fetch('/__kit-guide', {
        method: 'POST',
        body: JSON.stringify(data.payload.job, (_key, value: unknown) =>
          ArrayBuffer.isView(value) ? Array.from(value as unknown as ArrayLike<number>) : value,
        ),
      });

      if (!response.ok) throw new Error(await response.text());

      scope.postMessage({ id: data.id, result: await response.json() });
    } catch (error) {
      scope.postMessage({ id: data.id, error: String(error) });
    }
  };
}

async function whilePageLives(page: Page, request: () => Promise<void>) {
  try {
    await request();
  } catch (error) {
    if (!page.isClosed()) throw error;
  }
}

export async function stubKitGuideWorker(page: Page) {
  const rendered: Array<{ job: GuideJob; result: RenderedGuide }> = [];

  await page.context().route(/\/guide\.worker[.-].*(?:\?|$)/, (route) =>
    whilePageLives(page, async () => {
      const original = new URL(route.request().url());

      if (original.searchParams.has('basecase-guide-original')) {
        await route.continue();

        return;
      }

      original.searchParams.set('basecase-guide-original', '1');

      await route.fulfill({
        contentType: 'text/javascript',
        headers: { 'Cross-Origin-Embedder-Policy': 'credentialless' },
        body: `const queued = []; self.onmessage = (event) => queued.push(event);\nawait import(${JSON.stringify(original.href)});\n;(${guideWorkerFixture.toString()})();\nfor (const event of queued) self.onmessage(event);`,
      });
    }),
  );
  await page.context().route('**/__kit-guide', (route) =>
    whilePageLives(page, async () => {
      const job = route.request().postDataJSON() as GuideJob;
      const result = kitGuideReply(job);

      rendered.push({ job, result });
      await route.fulfill({ json: result });
    }),
  );

  return rendered;
}
