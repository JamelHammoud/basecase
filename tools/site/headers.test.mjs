import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import siteConfig from '../../site/vite.config.ts';
import { globalHeaders, headerProblems } from './headers.mjs';

vi.mock('./imageHealth.mjs', () => ({ siteImageProblems: async () => [] }));

async function emittedHeaders() {
  const config = siteConfig({ command: 'build', mode: 'production' });
  const plugin = config.plugins.find((entry) => entry.name === 'basecase-site-assets');
  const emitted = [];

  await plugin.generateBundle.call({ emitFile: (asset) => emitted.push(asset) });

  return emitted.find((asset) => asset.fileName === '_headers').source;
}

describe('public hosting headers', () => {
  it('emits a full site policy without permitting inline scripts or eval', async () => {
    const source = await emittedHeaders();

    expect(headerProblems(source, { full: true })).toEqual([]);
    expect(source).toContain('/assets/*\n  Cache-Control: public, max-age=31536000, immutable');
    expect(globalHeaders(source)['content-security-policy']).not.toMatch(
      /unsafe-eval|wasm-unsafe-eval|script-src[^;]*unsafe-inline/,
    );
  });

  it('protects the demo without adding script restrictions and preserves cross-origin isolation', () => {
    const source = readFileSync(new URL('../../public/_headers', import.meta.url), 'utf8');
    const headers = globalHeaders(source);

    expect(headerProblems(source)).toEqual([]);
    expect(headers['content-security-policy'].split(';').map((part) => part.trim())).toEqual([
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'none'",
    ]);
    expect(headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(headers['cross-origin-embedder-policy']).toBe('credentialless');
    expect(headers['cross-origin-resource-policy']).toBe('same-origin');
    expect(source).toContain('/assets/*\n  Cache-Control: public, max-age=31536000, immutable');
  });

  it('rejects missing, weakened and asset-only protection', async () => {
    const source = await emittedHeaders();

    for (const header of [
      'X-Content-Type-Options',
      'Referrer-Policy',
      'Strict-Transport-Security',
      'Content-Security-Policy',
    ]) {
      expect(
        headerProblems(source.replace(new RegExp(`^  ${header}:.*\\n`, 'm'), ''), { full: true }).length,
      ).toBeGreaterThan(0);
    }

    for (const directive of ['frame-ancestors', 'object-src', 'base-uri', 'default-src', 'script-src']) {
      expect(
        headerProblems(source.replace(new RegExp(`${directive} [^;\\n]+`), `${directive} *`), { full: true }).length,
      ).toBeGreaterThan(0);
    }

    expect(headerProblems(source.replace('/*\n', '/assets/*\n'), { full: true }).length).toBeGreaterThan(0);
  });
});
