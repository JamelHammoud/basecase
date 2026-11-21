import type { Page } from 'playwright-core';

export function routedSceneBackend(page: Page): Promise<() => Promise<void>>;
