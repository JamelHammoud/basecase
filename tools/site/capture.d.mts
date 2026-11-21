import type { Locator, Page } from 'playwright-core';

export function captureArticle(page: Page, options: { path: string; ready: Locator }): Promise<void>;
