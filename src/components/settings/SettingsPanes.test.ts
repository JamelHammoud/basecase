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

const referencedNames = (html: string, ids: string) => {
  const captions = new Map(
    [...html.matchAll(/<([a-z][a-z0-9]*)\b[^>]*\bid="([^"]+)"[^>]*>([^<]*)<\/\1>/g)].map((m) => [m[2], m[3]]),
  );
  const names = ids.split(/\s+/).map((id) => captions.get(id));

  return names.every((name) => name?.trim()) ? names.join(' ') : '';
};

const controlNames = (html: string) =>
  [...html.matchAll(CONTROL)].map(([tag]) => {
    const ids = /aria-labelledby="([^"]+)"/.exec(tag)?.[1];

    if (ids) return referencedNames(html, ids);

    return /aria-label="([^"]+)"/.exec(tag)?.[1] ?? '';
  });

describe('Settings panes', () => {
  it('rejects missing or empty caption references', () => {
    const html = '<span id="empty"></span><input aria-labelledby="missing"><input aria-labelledby="empty">';

    expect(controlNames(html)).toEqual(['', '']);
  });

  it.each(Object.keys(panes))('names every control in %s after its row', (name) => {
    const html = renderToStaticMarkup(panes[name]);

    expect(html).toMatch(CONTROL);
    expect(controlNames(html)).not.toContain('');
  });

  it('names the controls with the row labels a person reads', () => {
    const html = Object.values(panes)
      .map((pane) => renderToStaticMarkup(pane))
      .join('');

    const names = controlNames(html);

    for (const label of [
      'Currency',
      'Move mm',
      'Rotate',
      'Units',
      'Run with',
      'Command',
      'Have the agent fix new blockers',
      'Update automatically',
    ])
      expect(names).toContain(label);
  });
});
