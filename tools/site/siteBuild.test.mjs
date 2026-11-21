import { afterEach, expect, it, vi } from 'vitest';
import siteConfig from '../../site/vite.config.ts';
import { siteImageProblems } from './imageHealth.mjs';

vi.mock('./imageHealth.mjs', () => ({ siteImageProblems: vi.fn() }));

afterEach(() => vi.resetAllMocks());

it('stops the site build before emitting assets when an article image is a startup capture', async () => {
  siteImageProblems.mockResolvedValue(['changelog/export-a-robot-kit/cover.png: shows the Basecase loading screen']);

  const config = siteConfig({ command: 'build', mode: 'production' });
  const plugin = config.plugins.find((entry) => entry.name === 'basecase-site-assets');
  const context = { emitFile: vi.fn() };

  await expect(plugin.generateBundle.call(context)).rejects.toThrow(
    'changelog/export-a-robot-kit/cover.png: shows the Basecase loading screen',
  );
  expect(context.emitFile).not.toHaveBeenCalled();
});
