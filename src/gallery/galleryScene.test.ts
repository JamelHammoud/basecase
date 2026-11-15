import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { parseCase } from '../cases/schema';
import { galleryBundles } from './galleryEntries';
import { GalleryConsole } from './GalleryConsole';
import { GalleryScene } from './GalleryScene';

vi.mock('../components/Viewport3D', () => ({ Viewport3D: () => null }));

const bundles = galleryBundles();
const shared = {
  ...bundles[1],
  slug: 'shared-code-case',
  case: parseCase({
    ...bundles[1].case,
    console: {
      input: ['code', 'keys'],
      panels: [{ id: 'stick', kind: 'code', height: 160, source: '<canvas></canvas>' }],
      layout: { areas: [{ canvas: true }, { size: 320, panels: ['stick'] }] },
    },
  }),
};

describe('a gallery scene owns its simulation vision scope', () => {
  it.each([...bundles, shared])('renders $slug through the real simulation hooks', (bundle) => {
    const html = renderToStaticMarkup(
      createElement(GalleryScene, { bundle, Console: bundle.case.console ? GalleryConsole : null }),
    );

    expect(html).toContain('data-testid="gallery-card"');
    expect(html).toContain(bundle.case.name);
    expect(html).toContain('Open Scene');
  });
});
