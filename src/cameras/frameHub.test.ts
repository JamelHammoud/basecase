import { describe, expect, it } from 'vitest';
import { createFrameHub, type FrameSink } from './frameHub';

function sink() {
  const opened: { id: string; key: string; size: [number, number]; fps: number; port: MessagePort }[] = [];
  const closed: string[] = [];
  const feed: FrameSink = {
    stream: (id, { key, size, fps }, port) => opened.push({ id, key, size, fps, port }),
    unstream: (id) => closed.push(id),
  };

  return { feed, opened, closed };
}

describe('frame hub', () => {
  it('holds a stream until a feed exists, then hands its port over, clamped', () => {
    const hub = createFrameHub();
    const counts: number[] = [];

    hub.subscribe(() => counts.push(hub.count()));

    const stream = hub.open({ key: 'scene', width: 2000, height: 2000, fps: 90 });
    const live = sink();

    expect(hub.count()).toBe(1);

    hub.attach(live.feed);

    expect(live.opened).toEqual([
      expect.objectContaining({ key: 'scene', size: [640, 480], fps: 15, port: expect.anything() }),
    ]);
    expect(live.opened[0].port).not.toBe(stream.port);

    stream.close();
    stream.close();

    expect(live.closed).toEqual([live.opened[0].id]);
    expect(counts).toEqual([1, 0]);
    live.opened.forEach((o) => o.port.close());
    stream.port.close();
  });

  it('ends the streams a feed held when that feed goes away', () => {
    const hub = createFrameHub();
    const first = sink();
    const second = sink();

    hub.attach(first.feed);

    const stream = hub.open({ key: 'wrist_cam', width: 160, height: 120, fps: 10 });

    hub.attach(null);

    expect(hub.count()).toBe(0);

    hub.attach(second.feed);
    stream.close();

    expect(second.opened).toEqual([]);
    expect(second.closed).toEqual([]);
    first.opened.forEach((o) => o.port.close());
    stream.port.close();
  });
});
