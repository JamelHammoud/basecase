import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PanelKind, PanelOf } from '../../cases/console/panelKinds';
import { recordedBus, type SignalTrack } from '../../cases/console/recordedSignals';
import { createSignalBus, type SignalBus } from '../../cases/console/signalBus';
import { topicBus } from '../../topics/topicBus';
import { DIAGNOSTICS, IMU, JOINTS, MODE, ODOMETRY, ROSOUT, topicIndex } from '../../topics/topicFixtures';
import type { PanelContext } from './panelContext';
import { busNames, panelChoices } from './panelChoices';
import { PANEL_VIEWS } from './panelViews';
import { heldOn, onFrames, pairedX, sampleTotal } from './panels/plotSeries';
import { STATE_FILLS, stateBands, stateRange, stateSource } from './panels/stateBands';
import { entriesUntil, isListNode, opensAtFirst } from './panels/topicRows';
import { logEntries } from '../../topics/logs';

const FRAMES = [0, 0.5, 1, 1.5, 2];
const scope = { declared: new Set<string>(), probes: new Set<string>(), inputs: new Set<string>() };
const index = topicIndex(ROSOUT, DIAGNOSTICS, MODE, IMU, ODOMETRY, JOINTS);

function playback(frame: number) {
  const track: SignalTrack = {
    t: FRAMES,
    numbers: new Map([
      ['time', FRAMES],
      ['robot.x', [0, 0, 1, 1, 1]],
    ]),
    labels: new Map(),
  };
  const bus = topicBus(recordedBus(track), index);

  bus.seek(frame);

  return bus;
}

const draw = <K extends PanelKind>(bus: SignalBus, panel: Omit<PanelOf<K>, 'id'> & { kind: K }) => {
  const View = PANEL_VIEWS[panel.kind] as React.FC<{ panel: PanelOf<K>; ctx: PanelContext }>;
  const ctx = { bus, signals: [], scope } as unknown as PanelContext;

  return renderToStaticMarkup(createElement(View, { panel: { id: panel.kind, ...panel } as PanelOf<K>, ctx }));
};

const attrs = (html: string, testid: string, attr: string) =>
  [...html.matchAll(new RegExp(`data-testid="${testid}"[^>]*?${attr}="([^"]*)"`, 'g'))].map((m) => m[1]);

describe('Add Panel’s choices from a recording’s topics', () => {
  const bus = playback(0);
  const names = busNames(bus, []);
  const labels = (kind: PanelKind, topics = index) => panelChoices(kind, names, scope, topics).map((c) => c.label);

  it('lists every topic signal the bus holds', () => {
    expect(names).toEqual(
      expect.arrayContaining(['topic./imu.angular_velocity.x', 'topic./joint_states.effort[:]', 'topic./mode.data']),
    );
  });

  it('offers a log and diagnostics only when the recording has them', () => {
    expect(panelChoices('log', names, scope, index)).toEqual([{ label: 'Log', draft: { kind: 'log' } }]);
    expect(labels('diagnostics')).toEqual(['Diagnostics']);
    expect(labels('log', topicIndex(IMU))).toEqual([]);
    expect(panelChoices('diagnostics', names, scope)).toEqual([]);
  });

  it('offers a message per topic, states per signal and plots only of numbers', () => {
    expect(labels('message')).toEqual(
      ['/rosout', '/diagnostics', '/mode', '/imu', '/odom', '/joint_states'].map((t) => `topic.${t}`),
    );
    expect(panelChoices('message', names, scope, index)[3].draft).toEqual({ kind: 'message', topic: 'topic./imu' });
    expect(labels('states')).toEqual(
      expect.arrayContaining(['topic./mode.data', 'robot.x', 'topic./imu.angular_velocity.x']),
    );
    expect(labels('states')).not.toContain('topic./joint_states.effort[:]');
    expect(labels('plot')).toContain('topic./joint_states.effort[:]');
    expect(labels('plot')).not.toContain('topic./mode.data');
    expect(labels('value')).not.toContain('topic./joint_states.effort[:]');
  });
});

describe('plot helpers', () => {
  it('hold the newest sample at or before each time', () => {
    expect(heldOn({ t: [0, 1, 2], v: [10, 11, 12] }, [-1, 0, 0.5, 2, 3])).toEqual([NaN, 10, 10, 12, 12]);
  });

  it('pair x by index on equal times, else by holding it', () => {
    const x = { t: [0, 1, 2], v: [5, 6, 7] };

    expect(pairedX(x, { t: [0, 1, 2], v: [1, 2, 3] })).toBe(x.v);
    expect(pairedX(x, { t: [0.5, 1.5, 2.5, 3], v: [1, 2, 3, 4] })).toEqual([5, 6, 7, 7]);
    expect(pairedX(x, { t: [-1], v: [1] })).toEqual([NaN]);
  });

  it('draw a topic on the try’s frames, and anything else as it is', () => {
    const bus = playback(0);

    expect(onFrames(bus, 'topic./imu.angular_velocity.x')).toEqual([0, 2, 4, 6, 7]);
    expect(onFrames(bus, 'robot.x')).toEqual([0, 0, 1, 1, 1]);
    expect(onFrames(createSignalBus(), 'topic./imu.angular_velocity.x')).toEqual([]);
    expect(sampleTotal(bus, ['topic./imu.angular_velocity.x', 'robot.x'])).toBe(13);
  });
});

describe('state and log helpers', () => {
  it('lay out one band per run of a value, coloured per value', () => {
    const source = stateSource(playback(0), 'topic./mode.data');
    const bands = stateBands(source, stateRange(source, 2));

    expect(bands.map((b) => [b.value, b.left, Number(b.width.toFixed(2)), b.fill, b.named])).toEqual([
      ['idle', 0, 0.4, STATE_FILLS[0], true],
      ['walk', 0.4, 0.4, STATE_FILLS[1], true],
      ['idle', 0.8, 0.2, STATE_FILLS[0], true],
    ]);
    expect(stateBands(stateSource(playback(0), 'robot.x'), { from: 0, to: 2 }).map((b) => b.value)).toEqual(['0', '1']);
  });

  it('keep the newest log entries up to a time', () => {
    const entries = logEntries(index);

    expect(entriesUntil(entries, 0.6).map((e) => e.text)).toEqual(['ready', 'slow loop']);
    expect(entriesUntil(entries, 5, 1).map((e) => e.text)).toEqual(['motor fault']);
    expect(entriesUntil(entries, 0)).toEqual([]);
  });

  it('open objects two deep and keep lists closed', () => {
    const list = { key: 'effort', children: [{ key: '0', value: '1' }] };
    const object = { key: 'header', children: [{ key: 'frame_id', value: 'base' }] };

    expect(isListNode(list)).toBe(true);
    expect([opensAtFirst(object, 0), opensAtFirst(object, 1), opensAtFirst(object, 2)]).toEqual([true, true, false]);
    expect(opensAtFirst(list, 0)).toBe(false);
  });
});

describe('topic panels during playback', () => {
  it('show the log up to the playhead, filtered by level', () => {
    const html = draw(playback(2), { kind: 'log' });

    expect(attrs(html, 'log-entry', 'data-level')).toEqual(['info', 'warn']);
    expect(html).toContain('slow loop');
    expect(html).toContain('placeholder="Search log"');
    expect(attrs(draw(playback(4), { kind: 'log', level: 'warn' }), 'log-entry', 'data-level')).toEqual([
      'warn',
      'error',
    ]);
  });

  it('show each diagnostic’s newest status', () => {
    expect(attrs(draw(playback(2), { kind: 'diagnostics' }), 'diagnostic', 'data-level')).toEqual(['warn', 'ok']);
    expect(attrs(draw(playback(3), { kind: 'diagnostics' }), 'diagnostic', 'data-level')).toEqual(['stale', 'error']);
  });

  it('show the newest message as a tree, states as bands, and plots of topics', () => {
    const message = draw(playback(2), { kind: 'message', topic: 'topic./imu' });
    const states = draw(playback(2), { kind: 'states', signal: 'topic./mode.data' });
    const imu = draw(playback(2), { kind: 'plot', signals: ['topic./imu.angular_velocity.*'] });
    const odometry = draw(playback(2), {
      kind: 'plot',
      signals: ['topic./odom.pose.pose.position.y'],
      x: 'topic./odom.pose.pose.position.x',
    });

    expect(message).toContain('data-testid="message-tree"');
    expect(message).toContain('data-at="1.00"');
    expect(message).toContain('angular_velocity');
    expect(attrs(states, 'state-span', 'data-value')).toEqual(['idle', 'walk', 'idle']);
    expect(states).toContain('data-testid="states-playhead"');
    expect(imu).toMatch(/data-lines="3" data-samples="24"/);
    expect(odometry).toMatch(/data-samples="6"/);
    expect(odometry).toContain('data-testid="trace-topic./odom.pose.pose.position.y-now"');
  });

  it('draw nothing on a bus without topics', () => {
    const live = createSignalBus();

    expect(draw(live, { kind: 'log' })).toBe('');
    expect(draw(live, { kind: 'diagnostics' })).toBe('');
    expect(draw(live, { kind: 'message', topic: 'topic./imu' })).toBe('');
    expect(draw(live, { kind: 'states', signal: 'topic./mode.data' })).toBe('');
  });
});
