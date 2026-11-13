import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PreviewImage } from './PreviewImage';

const render = (src: string | undefined) =>
  renderToStaticMarkup(createElement(PreviewImage, { src, className: 'p-1' }));

describe('PreviewImage', () => {
  it('shows the image once it has rendered', () => {
    const html = render('data:image/webp;base64,AAAA');

    expect(html).toContain('<img');
    expect(html).toContain('p-1');
    expect(html).not.toContain('shimmer');
  });

  it('shimmers while the image is still rendering', () => {
    expect(render(undefined)).toContain('shimmer');
  });

  it('leaves the frame empty when there is no image, instead of shimmering forever or saying so', () => {
    expect(render('')).toBe('');
  });
});
