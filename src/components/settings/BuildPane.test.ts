import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BuildPane } from './BuildPane';

const prefs = { autoGuide: true, setAutoGuide: () => {}, autoFixBlockers: true, setAutoFixBlockers: () => {} };

describe('Build settings', () => {
  it('names the currency dropdown after its row, like every other Settings dropdown', () => {
    const html = renderToStaticMarkup(createElement(BuildPane, { prefs }));

    expect(html).toMatch(/<select[^>]*aria-label="Currency"/);
  });
});
