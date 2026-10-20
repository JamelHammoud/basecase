import { describe, expect, it } from 'vitest';
import ReactMarkdown from 'react-markdown';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { remarkHexSwatches } from '../../design-system/remarkHexSwatches';
import { buildPartIndex, partIdsOf, remarkPartLinks, splitParts } from './partIndex';

const index = buildPartIndex([
  { id: 'head-shell', name: 'Head Shell' },
  { id: 'visor', name: 'Visor' },
  { id: 'leg-l', name: 'Leg' },
  { id: 'leg-r', name: 'Leg' },
  { id: 'a1', name: 'Ax' },
]);

const render = (md: string) =>
  renderToStaticMarkup(
    createElement(ReactMarkdown, { remarkPlugins: [remarkPartLinks(index)], urlTransform: (url: string) => url }, md),
  );

describe('part links', () => {
  it('finds names and ids on word boundaries, longest first', () => {
    expect(splitParts('The Head Shell and visor-frame, then Visor.', index)).toEqual([
      { text: 'The ' },
      { text: 'Head Shell', ids: ['head-shell'] },
      { text: ' and visor-frame, then ' },
      { text: 'Visor', ids: ['visor'] },
      { text: '.' },
    ]);
  });

  it('links every part that shares a name, and skips short names', () => {
    expect(splitParts('Leg and Ax', index)).toEqual([{ text: 'Leg', ids: ['leg-l', 'leg-r'] }, { text: ' and Ax' }]);
  });

  it('links prose and inline code in markdown, but not code blocks or existing links', () => {
    const html = render('Fix **Visor** and `head-shell`.\n\n[Visor docs](https://x.y)\n\n```\nVisor\n```');

    expect(html).toContain('<a href="#part:visor">Visor</a>');
    expect(html).toContain('<a href="#part:head-shell"><code>head-shell</code></a>');
    expect(html).toContain('<a href="https://x.y">Visor docs</a>');
    expect(html).toContain('<code>Visor\n</code>');
    expect(partIdsOf('#part:leg-l%2Cleg-r')).toEqual(['leg-l', 'leg-r']);
  });

  it('puts a swatch before hex colors in prose and inline code, beside part links', () => {
    const html = renderToStaticMarkup(
      createElement(
        ReactMarkdown,
        { remarkPlugins: [remarkHexSwatches, remarkPartLinks(index)] },
        'Paint the Visor #0d99ff, not `#121212`. Fixes #123.',
      ),
    );

    expect(html).toBe(
      '<p>Paint the <a href="#part:visor">Visor</a> <span data-swatch="#0d99ff"></span>#0d99ff, not ' +
        '<span data-swatch="#121212"></span><code>#121212</code>. Fixes #123.</p>',
    );
  });
});
