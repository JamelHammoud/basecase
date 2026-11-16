import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-delivery-'));

vi.stubEnv('BASECASE_LOOP_DIR', directory);

const { deliver } = await import('./deliver.mjs');
const { publicationRecords } = await import('./publicationJournal.mjs');
const { completeDelivery, hasPendingDelivery, pendingSteps, saveDelivery } = await import('./deliveryState.mjs');
const { clearPath, close } = await import('./worktree.mjs');
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
  it('preserves the pending worktree when another lane tries to clear or close it', () => {
    const marker = path.join(directory, 'retained-work');

    fs.writeFileSync(marker, 'verified edits');
    saveDelivery(entry);

    expect(() => clearPath(directory)).toThrow('retained work');
    close(entry);
    expect(fs.readFileSync(marker, 'utf8')).toBe('verified edits');
  });

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

  it.each([
    { number: undefined, state: 'MERGED' },
    { number: 42, state: 'CLOSED' },
  ])('recognizes an existing $state pull without publishing a duplicate', ({ number, state }) => {
    const execute = vi.fn();
    const create = vi.fn();
    const saved = { ...entry, number };
    const found = { url: 'https://example.com/pull/42', state, headRefOid: 'published-head' };

    saveDelivery(saved);
    expect(
      deliver(saved, {
        execute,
        create,
        readJson: () => (number ? found : [found]),
      }),
    ).toBe('https://example.com/pull/42');
    expect(execute).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(publicationRecords().find((record) => record.branch === entry.branch)).toMatchObject({
      sha: 'verified-head',
      publishedSha: 'published-head',
    });
  });

  it('refuses to publish a different commit under the saved verification evidence', () => {
    const create = vi.fn();
    const execute = vi.fn(() => ({ out: 'different-head' }));

    saveDelivery(entry);
    expect(() => deliver(entry, { execute, create, readJson: () => [] })).toThrow('changed since verification');
    expect(create).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledOnce();
  });

  it('does not restore a completed delivery from another callers stale snapshot', () => {
    const readJson = vi.fn(() => {
      throw new Error('worktree already removed');
    });

    saveDelivery(entry);
    completeDelivery(entry.branch);

    expect(deliver(entry, { readJson })).toBeNull();
    expect(readJson).not.toHaveBeenCalled();
    expect(hasPendingDelivery(entry.branch)).toBe(false);
  });

  it('loads the current revision under its lock instead of publishing stale metadata', () => {
    const revision = { ...entry, number: 42, title: 'Feature: Updated title', sha: 'new-head' };
    const edit = vi.fn();

    saveDelivery(revision);

    expect(
      deliver(entry, {
        execute: () => ({ out: revision.sha }),
        readJson: () => ({ url: 'https://example.com/pull/42', state: 'OPEN' }),
        edit,
      }),
    ).toBe('https://example.com/pull/42');
    expect(edit).toHaveBeenCalledWith(42, { title: revision.title, body: revision.body });
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
