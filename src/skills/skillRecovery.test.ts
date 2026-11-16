import { describe, expect, it, vi } from 'vitest';
import type { KeyValueStore } from '../utils/keyValueStore';
import { fixtureModel } from './fixtureModels';
import { SkillRecovery, type RecoveryEntry } from './skillRecovery';

function setup(selected = true) {
  const entries = new Map<string, RecoveryEntry>();
  const store: KeyValueStore<RecoveryEntry> = {
    get: async (key) => entries.get(key),
    put: async (key, value) => entries.set(key, structuredClone(value)),
    delete: async (key) => entries.delete(key),
    deletePrefix: async () => entries.clear(),
  };
  const journal = new SkillRecovery({ workspaceId: 'scene', store, selected: async () => selected });

  return { journal, entries, store };
}

const row = { target: 'kit:stand', label: 'Stand' } as const;
const job = { type: 'kit', model: fixtureModel('quad-servo'), design: 'quad', entry: 'stand' } as const;

describe('remote skill recovery', () => {
  it('persists the workflow and exact worker input before allowing dispatch', async () => {
    const { journal, entries } = setup();

    journal.context = 'scene-task-hash';
    await journal.begin({ ...row, work: () => {} } as typeof row);
    await journal.capture({ type: 'worker', job });

    const stored = entries.get('scene');

    expect(stored?.context).toBe('scene-task-hash');
    expect(stored?.request).toEqual({ type: 'worker', job });
    expect(stored?.id).toBe(journal.key);
    expect(await journal.load(job.model)).toEqual(stored);
  });

  it('reattaches with the same workflow id after recreation and clears only on completion', async () => {
    const { journal, store } = setup();

    await journal.begin(row);
    await journal.capture({ type: 'worker', job });

    const recovered = new SkillRecovery({ workspaceId: 'scene', store, selected: async () => true });
    const stored = await recovered.load(job.model);

    expect(stored).not.toBeNull();
    await recovered.begin(row, stored!);
    expect(recovered.key).toBe(journal.key);
    await recovered.finish();
    expect(await recovered.load(job.model)).toBeNull();
  });

  it('refuses changed physics and changed scene tasks before any worker runs', async () => {
    const { journal } = setup();

    await journal.begin(row);
    await journal.capture({ type: 'worker', job });

    await expect(journal.load({ ...job.model, xml: job.model.xml.replace('damping="', 'damping="9') })).rejects.toThrow(
      'design',
    );
    journal.context = 'changed-case';
    await expect(journal.load(job.model)).rejects.toThrow('design');
  });

  it('refuses retention as soon as a design edit starts rebuilding its model', async () => {
    const { journal } = setup();

    await journal.begin(row);
    await journal.capture({ type: 'worker', job });
    journal.observe(job.model);
    expect(() => journal.assertCurrent()).not.toThrow();
    journal.invalidate();
    expect(() => journal.assertCurrent()).toThrow('design changed');
  });

  it('does not journal local training and fails before dispatch when persistence fails', async () => {
    const local = setup(false);

    await local.journal.begin(row);
    await local.journal.capture({ type: 'worker', job });
    expect(local.entries.size).toBe(0);

    const remote = setup();

    remote.store.put = vi.fn().mockRejectedValue(new Error('Disk full'));
    await remote.journal.begin(row);
    await expect(remote.journal.capture({ type: 'worker', job })).rejects.toThrow('Disk full');
  });
});
