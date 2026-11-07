import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KitScheduler } from '../../electron/kitScheduler.mjs';
import { PRIORITY, Trainer } from '../../electron/trainer.mjs';

interface FakeChild extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: () => void;
  dir: string;
  killed: boolean;
}

const DEBOUNCE_MS = 1000;

function fakeChild(dir: string): FakeChild {
  const child = new EventEmitter() as FakeChild;

  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.dir = dir;
  child.killed = false;
  child.kill = () => {
    child.killed = true;
    queueMicrotask(() => child.emit('close', null, 'SIGTERM'));
  };

  return child;
}

function rig() {
  const library = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-schedule-'));
  const children: FakeChild[] = [];
  const spawn = ({ dir }: { dir: string }) => {
    const child = fakeChild(dir);

    children.push(child);

    return child;
  };
  const trainer = new Trainer(library, () => {}, spawn, 'forge');
  const scheduler = new KitScheduler({ trainer, debounceMs: DEBOUNCE_MS });
  const xmlOf = (child: FakeChild) => fs.readFileSync(path.join(child.dir, 'model.xml'), 'utf8');
  const alive = () => children.filter((c) => !c.killed);

  return { trainer, scheduler, children, xmlOf, alive };
}

const settle = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

const kitJob = (name: string) => ({ name, task: 'kit' });
const userJob = (name: string) => ({ name, task: 'walk' });

describe('Kit retraining on CAD edits', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces a burst of edits and trains only the latest design, once', async () => {
    const { scheduler, children, xmlOf } = rig();

    for (const n of [1, 2, 3]) {
      scheduler.request({ workspaceId: 'scene', xml: `<m v="${n}"/>`, job: kitJob(`Kit ${n}`) });
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS / 3);
    }

    expect(children).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await settle();
    expect(children).toHaveLength(1);
    expect(xmlOf(children[0])).toBe('<m v="3"/>');
  });

  it('waits behind user training, and user training queued later still goes first', async () => {
    const { trainer, scheduler, children, xmlOf } = rig();

    trainer.start({ workspaceId: 'mine', xml: '<user/>', job: userJob('Mine') });
    scheduler.request({ workspaceId: 'scene', xml: '<kit/>', job: kitJob('Kit') });
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 2);
    trainer.start({ workspaceId: 'later', xml: '<later/>', job: userJob('Later'), priority: PRIORITY.user });
    expect(children).toHaveLength(1);
    expect(trainer.status().queued[0]).toBe('later');
    expect(trainer.status().queued).toHaveLength(2);

    children[0].emit('close', 0, null);
    await settle();
    expect(xmlOf(children[1])).toBe('<later/>');

    children[1].emit('close', 0, null);
    await settle();
    expect(xmlOf(children[2])).toBe('<kit/>');
  });

  it('replaces a queued Kit job with the latest design', async () => {
    const { trainer, scheduler, children, xmlOf } = rig();

    trainer.start({ workspaceId: 'mine', xml: '<user/>', job: userJob('Mine') });
    scheduler.request({ workspaceId: 'scene', xml: '<old/>', job: kitJob('Old') });
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 2);
    scheduler.request({ workspaceId: 'scene', xml: '<new/>', job: kitJob('New') });
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 2);
    await settle();
    expect(trainer.status().queued).toHaveLength(1);

    children[0].emit('close', 0, null);
    await settle();
    expect(children).toHaveLength(2);
    expect(xmlOf(children[1])).toBe('<new/>');
  });

  it('stops a running Kit job for an older design and trains the latest', async () => {
    const { trainer, scheduler, children, xmlOf, alive } = rig();

    scheduler.request({ workspaceId: 'scene', xml: '<old/>', job: kitJob('Old') });
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 2);
    await settle();
    expect(children).toHaveLength(1);

    scheduler.request({ workspaceId: 'scene', xml: '<new/>', job: kitJob('New') });
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 2);
    await settle();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 2);
    await settle();

    expect(children[0].killed || fs.existsSync(path.join(children[0].dir, 'stop'))).toBe(true);
    expect(alive().map(xmlOf)).toEqual(['<new/>']);
    expect(trainer.status().running).toHaveLength(1);
    expect(trainer.status().queued).toHaveLength(0);
  });

  it('keeps scenes apart', async () => {
    const { trainer, scheduler } = rig();

    scheduler.request({ workspaceId: 'a', xml: '<a/>', job: kitJob('A') });
    scheduler.request({ workspaceId: 'b', xml: '<b/>', job: kitJob('B') });
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 2);
    await settle();
    expect(trainer.status().running.length + trainer.status().queued.length).toBe(2);
  });
});
