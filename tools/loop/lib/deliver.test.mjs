import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-delivery-'));

vi.stubEnv('BASECASE_LOOP_DIR', directory);

const { deliver } = await import('./deliver.mjs');
const { completeDelivery, hasPendingDelivery, pendingSteps, saveDelivery } = await import('./deliveryState.mjs');
const entry = {
  branch: 'loop/build/42-feature',
  dir: directory,
  sha: 'verified-head',
  body: 'Closes #42.',
  title: 'Feature: Add it',
  label: 'loop:feature',
};

afterEach(() => completeDelivery(entry.branch));
afterAll(() => {
  fs.rmSync(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

describe('durable delivery', () => {
  it('preserves verified work after a push failure and retries delivery without rebuilding', () => {
    let fail = true;
    const create = vi.fn(() => 'https://example.com/pull/42');
    const execute = (_command, args) => {
      if (args[0] === 'push' && fail) throw new Error('network down');

      return { out: 'verified-head' };
    };
    const dependencies = { execute, readJson: () => [], create };

    saveDelivery(entry);
    expect(() => deliver(entry, dependencies)).toThrow('network down');
    expect(hasPendingDelivery(entry.branch)).toBe(true);
    expect(pendingSteps().has(42)).toBe(true);
    expect(create).not.toHaveBeenCalled();
    fail = false;
    expect(deliver(entry, dependencies)).toBe('https://example.com/pull/42');
    expect(create).toHaveBeenCalledOnce();
    expect(hasPendingDelivery(entry.branch)).toBe(false);
  });

  it('recognizes a successful request whose response was lost instead of publishing a duplicate', () => {
    const execute = vi.fn();
    const create = vi.fn();

    saveDelivery(entry);
    expect(
      deliver(entry, { execute, create, readJson: () => [{ url: 'https://example.com/pull/42', state: 'MERGED' }] }),
    ).toBe('https://example.com/pull/42');
    expect(execute).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses to publish a different commit under the saved verification evidence', () => {
    const create = vi.fn();
    const execute = vi.fn(() => ({ out: 'different-head' }));

    expect(() => deliver(entry, { execute, create, readJson: () => [] })).toThrow('changed since verification');
    expect(create).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledOnce();
  });

  it('retries revision metadata after its push without rerunning the author or writer', () => {
    const revision = { ...entry, number: 42 };
    const edit = vi.fn();
    const create = vi.fn();

    saveDelivery(revision);
    expect(
      deliver(revision, {
        execute: () => ({ out: 'verified-head' }),
        readJson: () => ({ url: 'https://example.com/pull/42', state: 'OPEN' }),
        create,
        edit,
      }),
    ).toBe('https://example.com/pull/42');
    expect(edit).toHaveBeenCalledWith(42, { title: entry.title, body: entry.body });
    expect(create).not.toHaveBeenCalled();
  });
});
