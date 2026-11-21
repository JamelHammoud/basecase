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
    },
  );

  it('does not allow data URLs in ordinary links or execute raw HTML', () => {
    const html = render('[Document](data:image/png;base64,AAAA)\n\n<img src="https://example.com/log">');

    expect(html).not.toContain('href="data:');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });
});
