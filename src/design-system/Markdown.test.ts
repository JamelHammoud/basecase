import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Markdown } from './Markdown';

const render = (text: string) => renderToStaticMarkup(createElement(Markdown, { children: text }));

describe('Markdown image requests', () => {
  it.each(['https://example.com/log?d=scene', 'http://example.com/log', '//example.com/log', '/api/log'])(
    'renders %s as a link without an image or preload',
    (url) => {
      const html = render(`![Scene evidence](${url})`);

      expect(html).not.toContain('<img');
      expect(html).not.toContain('<link');
      expect(html).toContain(`href="${url}"`);
      expect(html).toContain('target="_blank" rel="noreferrer"');
      expect(html).toContain('>Scene evidence</a>');
    },
  );

  it('uses the URL when an image has no alt text', () => {
    expect(render('![](https://example.com/log)')).toContain('>https://example.com/log</a>');
  });

  it.each(['![Thumbnail](https://example.com/image)', '![Thumbnail][image]\n\n[image]: https://example.com/image'])(
    'preserves the enclosing destination without nested links for %s',
    (image) => {
      const [label, definition = ''] = image.split('\n\n');
      const html = render(`[${label}](https://example.com/page)\n\n${definition}`);

      expect(html.match(/<a /g)).toHaveLength(1);
      expect(html).toContain('href="https://example.com/page"');
      expect(html).toContain('>Thumbnail</a>');
      expect(html).not.toContain('<img');
      expect(html).not.toContain('https://example.com/image');
    },
  );

  it('keeps embedded PNG images', () => {
    const src = 'data:image/png;base64,iVBORw0KGgo=';
    const html = render(`![Inline evidence](${src})`);

    expect(html).toContain(`<img src="${src}" alt="Inline evidence"`);
  });

  it.each(['javascript:alert%281%29', 'data:text/html;base64,AAAA', 'file:///tmp/image.png'])(
    'keeps the default sanitizer for unsafe image links: %s',
    (url) => {
      const html = render(`![Evidence](${url})`);

      expect(html).not.toContain('<img');
      expect(html).not.toContain(url);
      expect(html).not.toContain('<a ');
    },
  );

  it('does not allow data URLs in ordinary links or execute raw HTML', () => {
    const html = render('[Document](data:image/png;base64,AAAA)\n\n<img src="https://example.com/log">');

    expect(html).not.toContain('href="data:');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });
});
