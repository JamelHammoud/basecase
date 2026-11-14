import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { SceneTabInfo } from '../SceneTabs';
import { SceneTab, type SceneTabHandlers } from './SceneTab';

const noop = () => {};
const handlers = new Proxy({}, { get: () => noop }) as SceneTabHandlers;

const render = (tab: Partial<SceneTabInfo>, active: boolean) =>
  renderToStaticMarkup(
    createElement(SceneTab, {
      tab: { id: 's1', name: 'Reach a Spot: Two-wheel rover', partCount: 4, busy: false, activity: '', ...tab },
      active,
      dragging: false,
      isNew: false,
      renaming: false,
      track: noop,
      handlers,
    }),
  );

describe('scene tab names', () => {
  it('names the tab by its scene and its × as closing that scene', () => {
    const html = render({}, true);

    expect(html).toMatch(/role="tab"[^>]*aria-label="Reach a Spot: Two-wheel rover"/);
    expect(html).toMatch(/<button[^>]*data-tab-close[^>]*aria-label="Close Reach a Spot: Two-wheel rover"/);
    expect(html).not.toMatch(/<(button|span)[^>]*aria-hidden/);
  });

  it('names a background tab’s × too, and an unnamed scene as Untitled', () => {
    const html = render({ name: '' }, false);

    expect(html).toMatch(/role="tab"[^>]*aria-label="Untitled"/);
    expect(html).toMatch(/aria-label="Close Untitled"/);
  });

  it('keeps the × out of the Tab order, so Tab moves between tabs', () => {
    expect(render({}, true)).toMatch(/<button[^>]*tabindex="-1"/);
  });
});
