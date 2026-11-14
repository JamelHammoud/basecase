import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CaseSection } from '../components/simulate/CaseSections';
import type { CaseExplore } from '../workspace/useCaseExplore';
import type { Cases } from '../workspace/useCases';
import { ExpandIcon } from './glyphs';
import { IconButton } from './IconButton';

const buttonsIn = (html: string) => html.match(/<button[^>]*>/g) ?? [];

const labelOf = (button = '') => button.match(/aria-label="([^"]*)"/)?.[1];

describe('IconButton names', () => {
  it('names the button by its title, with no native title or description beside it', () => {
    const [button] = buttonsIn(
      renderToStaticMarkup(createElement(IconButton, { icon: createElement(ExpandIcon), title: 'Run Case' })),
    );

    expect(labelOf(button)).toBe('Run Case');
    expect(button).not.toMatch(/ title=|aria-describedby/);
  });

  it('keeps the title as its name when a caller passes an empty label', () => {
    const [button] = buttonsIn(
      renderToStaticMarkup(
        createElement(IconButton, { icon: createElement(ExpandIcon), title: 'Run Case', 'aria-label': '' }),
      ),
    );

    expect(labelOf(button)).toBe('Run Case');
  });

  it('names every button in an open Case’s header', () => {
    const cases = { active: { name: 'Reach a Spot', brief: 'Reach the spot.' }, open: () => {} } as unknown as Cases;
    const explore = { running: false, available: true, start: () => {}, stop: () => {} } as unknown as CaseExplore;
    const html = renderToStaticMarkup(
      createElement(CaseSection, { cases, check: null, onOpenCheck: () => {}, onRun: () => {}, explore }),
    );

    expect(buttonsIn(html).map(labelOf)).toEqual(['Explore', 'Run Case', 'Close Case']);
  });
});
