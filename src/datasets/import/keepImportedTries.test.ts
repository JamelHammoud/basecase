import { describe, expect, it, vi } from 'vitest';
import type { StoredTry } from '../../cases/tryFile';
import { emptyLabels } from '../../cases/tryLabels';
import type { ImportedTry } from './importedTries';
import { keepImportedTries } from './keepImportedTries';

const imported = (id: string, split?: StoredTry['split']): ImportedTry => ({
  stored: {
    version: 1,
    id,
    sceneId: 'scene',
    robot: { name: 'Arm', modelHash: 'model', joints: [] },
    case: null,
    source: 'import',
    input: null,
    startedAt: 'now',
    seconds: 1,
    rate: 50,
    frames: 50,
    outcome: { verdict: 'unjudged', margin: null },
    seed: 0,
    sourceTry: null,
    faults: [],
    ...(split ? { split } : {}),
  },
  recording: {} as ImportedTry['recording'],
});

function portsFor(existing: StoredTry[] = []) {
  return {
    manifests: vi.fn(async (ids: string[]) => existing.filter((stored) => ids.includes(stored.id))),
    keep: vi.fn<(tries: ImportedTry[]) => Promise<void>>().mockResolvedValue(undefined),
    update: vi.fn(async (stored: StoredTry[]) => stored),
  };
}

describe('keeping imported source splits', () => {
  it.each([false, true])(
    'rejects conflicting duplicate episodes before any writes, already stored: %s',
    async (saved) => {
      const ports = portsFor(saved ? [imported('same').stored] : []);

      await expect(keepImportedTries([imported('same', 'train'), imported('same', 'test')], ports)).rejects.toThrow(
        /conflicting.*splits/i,
      );
      expect(ports.keep).not.toHaveBeenCalled();
      expect(ports.update).not.toHaveBeenCalled();
    },
  );

  it('rejects conflicting reimports before keeping any other new episodes', async () => {
    const ports = portsFor([imported('same', 'train').stored]);

    await expect(keepImportedTries([imported('new', 'test'), imported('same', 'validation')], ports)).rejects.toThrow(
      /conflicting.*splits/i,
    );
    expect(ports.keep).not.toHaveBeenCalled();
    expect(ports.update).not.toHaveBeenCalled();
  });

  it('deduplicates a fresh source while retaining an assignment that follows an unassigned duplicate', async () => {
    const ports = portsFor();

    expect(await keepImportedTries([imported('same'), imported('same', 'test'), imported('same')], ports)).toBe(1);
    expect(ports.keep).toHaveBeenCalledExactlyOnceWith([imported('same', 'test')]);
    expect(ports.update).not.toHaveBeenCalled();
  });

  it('adds missing explicit metadata without replacing labels, verdicts, or recording bytes', async () => {
    const original = {
      ...imported('same').stored,
      outcome: { verdict: 'passed' as const, margin: 1, by: 'person' as const },
      labels: { ...emptyLabels(), tags: ['kept'], instruction: 'Keep this instruction' },
    };
    const ports = portsFor([original]);

    expect(await keepImportedTries([imported('same', 'validation')], ports)).toBe(0);
    expect(ports.update).toHaveBeenCalledExactlyOnceWith([{ ...original, split: 'validation' }]);
    expect(ports.keep).not.toHaveBeenCalled();
    expect(original).not.toHaveProperty('split');
  });

  it('preserves existing explicit metadata for matching and unassigned reimports', async () => {
    const ports = portsFor([imported('same', 'train').stored]);

    expect(await keepImportedTries([imported('same'), imported('same', 'train')], ports)).toBe(0);
    expect(ports.keep).not.toHaveBeenCalled();
    expect(ports.update).not.toHaveBeenCalled();
  });

  it('reports an existing manifest removed before its split could be saved', async () => {
    const ports = portsFor([imported('same').stored]);

    ports.update.mockResolvedValue([]);

    await expect(keepImportedTries([imported('same', 'train'), imported('new')], ports)).rejects.toThrow(
      'Import the files again.',
    );
    expect(ports.keep).not.toHaveBeenCalled();
  });

  it('loads at most 500 existing manifests per request and checks every requested id', async () => {
    const inputs = Array.from({ length: 501 }, (_, i) => imported(`try-${i}`));
    const ports = portsFor();

    expect(await keepImportedTries(inputs, ports)).toBe(501);
    expect(ports.manifests.mock.calls.map(([ids]) => ids.length)).toEqual([500, 1]);
    expect(ports.manifests.mock.calls.flatMap(([ids]) => ids)).toEqual(inputs.map(({ stored }) => stored.id));
  });
});
