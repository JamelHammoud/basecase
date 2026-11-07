import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { PRIORITY, Trainer } from './trainer.mjs';

vi.mock('./uv.mjs', () => ({ findUv: () => '/fake/uv', UV_INSTALL: 'install uv' }));

function fakeChild() {
  const child = new EventEmitter();

  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => child.emit('close', null, 'SIGTERM');

  return child;
}

function trainer() {
  const library = fs.mkdtempSync(path.join(os.tmpdir(), 'trainer-'));
  const events = [];
  const children = [];
  const t = new Trainer(
    library,
    (e) => events.push(e),
    () => {
      const c = fakeChild();

      children.push(c);

      return c;
    },
  );

  return { t, events, children };
}

const job = (name) => ({ name, task: 'walk' });
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('the training queue', () => {
  it('runs one job at a time and starts the next when it ends', async () => {
    const { t, events, children } = trainer();

    t.start({ workspaceId: 'a', xml: '<m/>', job: job('Walk 1') });
    t.start({ workspaceId: 'b', xml: '<m/>', job: job('Walk 2') });

    expect(children).toHaveLength(1);
    expect(t.status().queued).toEqual(['b']);
    expect(events.at(-1).message).toBe('Queued. Starts after Walk 1.');

    children[0].emit('close', 0, null);
    await tick();

    expect(children).toHaveLength(2);
    expect(t.status().running).toEqual(['b']);
    expect(t.status().queued).toEqual([]);
  });

  it('puts user training ahead of background work', async () => {
    const { t, children } = trainer();

    t.start({ workspaceId: 'a', xml: '<m/>', job: job('Running') });
    t.start({ workspaceId: 'kit', xml: '<m/>', job: job('Kit'), priority: PRIORITY.kit });
    t.start({ workspaceId: 'user', xml: '<m/>', job: job('Mine') });

    expect(t.status().queued).toEqual(['user', 'kit']);
    children[0].emit('close', 0, null);
    await tick();
    expect(t.status().running).toEqual(['user']);
  });

  it('refuses a scene that is already running or queued', () => {
    const { t } = trainer();

    t.start({ workspaceId: 'a', xml: '<m/>', job: job('One') });
    t.start({ workspaceId: 'b', xml: '<m/>', job: job('Two') });
    expect(() => t.start({ workspaceId: 'a', xml: '<m/>', job: job('Again') })).toThrow(/already/);
    expect(() => t.start({ workspaceId: 'b', xml: '<m/>', job: job('Again') })).toThrow(/already/);
  });

  it('stopping a queued job removes it without touching the running one', () => {
    const { t, children, events } = trainer();

    t.start({ workspaceId: 'a', xml: '<m/>', job: job('One') });
    t.start({ workspaceId: 'b', xml: '<m/>', job: job('Two') });
    t.stop('b');

    expect(t.status().queued).toEqual([]);
    expect(t.status().running).toEqual(['a']);
    expect(children).toHaveLength(1);
    expect(events.at(-1)).toMatchObject({ workspaceId: 'b', kind: 'error', message: 'Training stopped.' });
  });

  it('reports a killed trainer as a crash, and an asked-for stop as a stop', async () => {
    const crashed = trainer();

    crashed.t.start({ workspaceId: 'a', xml: '<m/>', job: job('One') });
    crashed.children[0].emit('close', null, 'SIGSEGV');
    expect(crashed.events.at(-1).message).toContain('crashed');

    const stopped = trainer();

    stopped.t.start({ workspaceId: 'a', xml: '<m/>', job: job('One') });
    stopped.t.stop('a');
    stopped.children[0].emit('close', null, 'SIGTERM');
    expect(stopped.events.at(-1).message).toBe('Training stopped.');
  });
});
