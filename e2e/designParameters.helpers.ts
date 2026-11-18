import type { Page } from 'playwright-core';
import type { RenderedCad } from '../src/utils/platform/types';

interface Kernel {
  renderPart: (language: string, code: string, options?: { expect?: Record<string, unknown> }) => Promise<RenderedCad>;
  stopKernels: () => void;
}

const load = (name: string) => import(/* @vite-ignore */ name);

export async function parameterKernel(page: Page) {
  const { createNodeKernel } = await load(new URL('../electron/cad-kernel/nodeHost/client.mjs', import.meta.url).href);
  const kernel: Kernel = createNodeKernel();
  const codes: string[] = [];

  await page.route('**/api/bridge/cad-render', async (route) => {
    const request = route.request().postDataJSON();

    codes.push(request.code);
    await route.fulfill({ json: await kernel.renderPart(request.language, request.code, { expect: request.expect }) });
  });

  return { codes, close: () => kernel.stopKernels() };
}
