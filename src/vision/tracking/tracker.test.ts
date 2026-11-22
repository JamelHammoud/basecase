import { describe, expect, it } from 'vitest';
import { detectionsOf, framesOf, summarize, type Workflow } from './fixtures/scripts';
import { TrackingSession } from './session';
import { ObjectTracker } from './tracker';
import { WORKFLOWS } from './fixtures/workflows';

function replay(workflow: Workflow, session = new TrackingSession()) {
  session.configure('camera', workflow.regions);

  const frames = framesOf(workflow);
  const snapshots = frames.map((frame) => session.update('camera', detectionsOf(workflow, frame), frame.timestamp));

  return summarize(workflow, frames, snapshots);
}

describe('scripted workflows', () => {
  it.each(WORKFLOWS.map((workflow) => [workflow.id, workflow] as const))('%s', (_name, workflow) => {
    expect(replay(workflow)).toMatchObject(workflow.expect);
  });

  it('lists at least ten distinct workflows', () => {
    expect(new Set(WORKFLOWS.map((workflow) => workflow.id)).size).toBeGreaterThanOrEqual(10);
  });

  it('gives the two crossing people different ids for the whole walk', () => {
    const workflow = WORKFLOWS.find((candidate) => candidate.id === 'two crossing people')!;
    const { objectIds } = replay(workflow);

    expect(objectIds[0]).toHaveLength(1);
    expect(objectIds[1]).toHaveLength(1);
    expect(objectIds[0][0]).not.toBe(objectIds[1][0]);
  });

  it('keeps separate ids when two people overlap at the same height and pass', () => {
    const tracker = new ObjectTracker();
    const ids = new Set<number>();
    let last: number[] = [];

    for (let step = 0; step <= 20; step++) {
      const a = 0.1 + step * 0.04;
      const b = 0.9 - step * 0.04;
      const tracks = tracker.update(
        [
          { label: 'person', score: 0.9, box: [a - 0.05, 0.4, 0.1, 0.25] },
          { label: 'person', score: 0.8, box: [b - 0.05, 0.4, 0.1, 0.25] },
        ],
        1000 + step * 200,
      );

      tracks.forEach((track) => ids.add(track.id));
      last = tracks.map((track) => track.id);
    }

    expect(ids.size).toBe(2);
    expect(last).toHaveLength(2);
  });
});

describe('id limits', () => {
  const at = (x: number, time: number, tracker: ObjectTracker) =>
    tracker.update([{ label: 'block', score: 0.9, box: [x, 0.5, 0.08, 0.08] }], time);

  it('never reuses an id and gives a new one after the miss window', () => {
    const tracker = new ObjectTracker();

    at(0.3, 1000, tracker);

    const first = at(0.3, 1200, tracker)[0].id;

    tracker.update([], 1400);
    tracker.update([], 3500);

    at(0.3, 3700, tracker);

    const second = at(0.3, 3900, tracker)[0].id;

    expect(second).toBeGreaterThan(first);
  });

  it('keeps the id across a miss shorter than the window', () => {
    const tracker = new ObjectTracker();

    at(0.3, 1000, tracker);

    const id = at(0.3, 1200, tracker)[0].id;

    tracker.update([], 1400);
    tracker.update([], 1600);

    expect(at(0.3, 1800, tracker)[0].id).toBe(id);
  });

  it('starts a new track for a jump of more than a box and a half', () => {
    const tracker = new ObjectTracker();

    at(0.2, 1000, tracker);

    const id = at(0.2, 1200, tracker)[0].id;

    at(0.6, 1400, tracker);

    const tracks = at(0.6, 1600, tracker);

    expect(tracks.every((track) => track.id !== id || track.coasting)).toBe(true);
    expect(tracks.some((track) => track.id !== id)).toBe(true);
  });

  it('matches by class so a person never takes a block’s id', () => {
    const tracker = new ObjectTracker();

    at(0.3, 1000, tracker);

    const id = at(0.3, 1200, tracker)[0].id;
    const tracks = tracker.update([{ label: 'person', score: 0.9, box: [0.3, 0.5, 0.08, 0.08] }], 1400);

    expect(tracks.find((track) => track.label === 'person')).toBeUndefined();
    expect(tracks.find((track) => track.id === id)?.coasting).toBe(true);
  });

  it('drops a detection seen once so noise never becomes a track', () => {
    const tracker = new ObjectTracker();

    expect(at(0.3, 1000, tracker)).toEqual([]);
    expect(tracker.update([], 1200)).toEqual([]);
    expect(tracker.size).toBe(0);
  });
});

describe('bounds', () => {
  it('holds at most the configured tracks and detections however many objects appear', () => {
    const tracker = new ObjectTracker({ maxTracks: 8, maxDetections: 6 });
    const crowd = Array.from({ length: 50 }, (_, index) => ({
      label: 'block',
      score: 0.9,
      box: [(index % 10) * 0.1, Math.floor(index / 10) * 0.2, 0.05, 0.05] as [number, number, number, number],
    }));

    for (let step = 0; step < 40; step++) tracker.update(crowd.slice(step % 3), 1000 + step * 100);

    expect(tracker.size).toBeLessThanOrEqual(8);
  });

  it('holds the camera count of a session', () => {
    const session = new TrackingSession({}, 3);

    for (let camera = 0; camera < 10; camera++) session.update(`c${camera}`, [], 1000);

    expect(session.size).toBe(3);
  });

  it('ignores detections with non-finite boxes or scores', () => {
    const tracker = new ObjectTracker({ minHits: 1 });
    const tracks = tracker.update(
      [
        { label: 'block', score: Number.NaN, box: [0.1, 0.1, 0.1, 0.1] },
        { label: 'block', score: 0.9, box: [Number.NaN, 0.1, 0.1, 0.1] },
        { label: 'block', score: 0.9, box: [0.1, 0.1, 0.1, 0.1] },
      ],
      1000,
    );

    expect(tracks).toHaveLength(1);
  });
});

describe('sessions', () => {
  const workflow = WORKFLOWS[0];

  it('starts over when time runs backwards, as a restarted try or a seek does', () => {
    const session = new TrackingSession();
    const first = replay(workflow, session);
    const again = replay(workflow, session);

    expect(first.crossings.gate).toEqual([4, 0]);
    expect(again.crossings.gate).toEqual([4, 0]);
  });

  it('keeps two cameras with the same zone and line names apart', () => {
    const session = new TrackingSession();
    const frames = framesOf(workflow);

    session.configure('a', workflow.regions);
    session.configure('b', workflow.regions);

    const last = frames
      .map((frame) => ({
        a: session.update('a', detectionsOf(workflow, frame), frame.timestamp),
        b: session.update('b', frame.timestamp < 6000 ? [] : detectionsOf(workflow, frame), frame.timestamp),
      }))
      .at(-1)!;

    expect(last.a.lines[0].in).toBe(4);
    expect(last.b.lines[0].in).toBeLessThan(4);
  });

  it('restarts the counts when the regions change and keeps them when they do not', () => {
    const session = new TrackingSession();
    const frames = framesOf(workflow);

    session.configure('camera', workflow.regions);
    frames.slice(0, 30).forEach((frame) => session.update('camera', detectionsOf(workflow, frame), frame.timestamp));

    const before = session.update('camera', [], frames[30].timestamp).lines[0].in;

    session.configure('camera', workflow.regions);

    expect(session.update('camera', [], frames[31].timestamp).lines[0].in).toBe(before);

    session.configure('camera', { zones: [], lines: [{ ...workflow.regions.lines[0], name: 'other' }] });

    expect(session.update('camera', [], frames[32].timestamp).lines[0]).toMatchObject({ name: 'other', in: 0 });
  });

  it('reads zero tracks, counts and dwell once everything leaves', () => {
    const session = new TrackingSession();
    const bin = WORKFLOWS.find((candidate) => candidate.id === 'bin occupancy')!;

    replay(bin, session);

    const end = session.update('camera', [], 99000);

    expect(end.tracks).toEqual([]);
    expect(end.zones[0]).toMatchObject({ count: 0, dwell: 0 });
  });
});

describe('lines', () => {
  const walkAcross = (ys: number[]) => {
    const session = new TrackingSession();

    session.configure('camera', { zones: [], lines: [{ name: 'door', from: [0, 0.5], to: [1, 0.5] }] });

    return ys
      .map((y, step) =>
        session.update('camera', [{ label: 'person', score: 0.9, box: [0.4, y - 0.05, 0.1, 0.1] }], 1000 + step * 200),
      )
      .at(-1)!.lines[0];
  };

  it('counts a walk that lands on the line for one frame once, in the direction it went', () => {
    expect(walkAcross([0.3, 0.4, 0.502, 0.6, 0.7])).toMatchObject({ in: 1, out: 0 });
    expect(walkAcross([0.7, 0.6, 0.498, 0.4, 0.3])).toMatchObject({ in: 0, out: 1 });
  });

  it('counts nothing for an object that hovers on either side of the line', () => {
    expect(walkAcross([0.4, 0.499, 0.501, 0.499, 0.502, 0.4])).toMatchObject({ in: 0, out: 0 });
  });

  it('counts each real pass of an object that goes back and forth', () => {
    expect(walkAcross([0.34, 0.42, 0.5, 0.58, 0.66, 0.58, 0.5, 0.42, 0.34, 0.42, 0.5, 0.58])).toMatchObject({
      in: 2,
      out: 1,
    });
  });

  it('ignores a crossing of the line’s extension beyond its ends', () => {
    const session = new TrackingSession();

    session.configure('camera', { zones: [], lines: [{ name: 'short', from: [0.4, 0.5], to: [0.6, 0.5] }] });

    const last = [0.3, 0.4, 0.6, 0.7]
      .map((y, step) =>
        session.update('camera', [{ label: 'block', score: 0.9, box: [0.8, y - 0.05, 0.1, 0.1] }], 1000 + step * 200),
      )
      .at(-1)!;

    expect(last.lines[0]).toMatchObject({ in: 0, out: 0 });
  });
});

describe('cancellation', () => {
  it('forgets a removed camera so its counts and ids start over', () => {
    const session = new TrackingSession();
    const workflow = WORKFLOWS[0];

    replay(workflow, session);
    session.removeWhere((camera) => camera === 'camera');
    session.configure('camera', workflow.regions);

    expect(session.update('camera', [], 99000)).toMatchObject({ tracks: [], lines: [{ in: 0, out: 0 }] });
  });
});
