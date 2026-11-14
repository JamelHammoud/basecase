import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AgentPane } from './AgentPane';
import { BuildPane } from './BuildPane';
import { CanvasPane } from './CanvasPane';

const noop = () => {};

const panes: Record<string, ReactElement> = {
  Canvas: createElement(CanvasPane, {
    sculptEnabled: false,
    onSculptEnabled: noop,
    snapStepMm: 1,
    onSnapStep: noop,
    snapAngleDeg: 15,
    onSnapAngle: noop,
    measureUnit: 'metric',
    onMeasureUnit: noop,
    trackpadMode: 'orbit-scroll',
    onTrackpadMode: noop,
  }),
  Agent: createElement(AgentPane, {
    acpStatus: { connected: false, sessionId: null, agentName: 'Offline', agentCommand: 'node agent.mjs' },
    onReconnectAcp: async () => {},
  }),
  Build: createElement(BuildPane, {
    prefs: { autoGuide: true, setAutoGuide: noop, autoFixBlockers: true, setAutoFixBlockers: noop },
  }),
};

const CONTROL = /<(?:select|input)\b[^>]*>|<[a-z]+\b[^>]*role="(?:tablist|switch)"[^>]*>/g;

const unnamedControls = (html: string) =>
  [...html.matchAll(CONTROL)].map((m) => m[0]).filter((tag) => !/aria-label="[^"]+"/.test(tag));

describe('Settings panes', () => {
  it.each(Object.keys(panes))('names every control in %s after its row', (name) => {
    const html = renderToStaticMarkup(panes[name]);

    expect(html).toMatch(CONTROL);
    expect(unnamedControls(html)).toEqual([]);
  });

  it('names the controls with the row labels a person reads', () => {
    const html = Object.values(panes)
      .map((pane) => renderToStaticMarkup(pane))
      .join('');

    for (const label of ['Currency', 'Move mm', 'Rotate', 'Units', 'Run with', 'Command'])
      expect(html).toContain(`aria-label="${label}"`);
  });
});
