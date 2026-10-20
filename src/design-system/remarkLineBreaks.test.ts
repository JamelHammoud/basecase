import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import { remarkHtmlAsText } from './remarkHtmlAsText';
import { remarkLineBreaks } from './remarkLineBreaks';

describe('remarkLineBreaks', () => {
  it('keeps typed line breaks but leaves code blocks alone', () => {
    const html = renderToStaticMarkup(
      createElement(ReactMarkdown, { remarkPlugins: [remarkLineBreaks] }, 'Taller legs\nwider feet\n\n```\na\nb\n```'),
    );

    expect(html).toBe('<p>Taller legs<br/>\nwider feet</p>\n<pre><code>a\nb\n</code></pre>');
  });

  it('shows pasted HTML as text instead of dropping it', () => {
    const html = renderToStaticMarkup(
      createElement(
        ReactMarkdown,
        { remarkPlugins: [remarkHtmlAsText, remarkLineBreaks] },
        'Rounder head:\n\n<svg width="10">\n<rect fill="#fff"/>\n</svg>',
      ),
    );

    expect(html).toContain('<p>&lt;svg width=&quot;10&quot;&gt;<br/>');
    expect(html).toContain('&lt;rect fill=&quot;#fff&quot;/&gt;');
  });
});
