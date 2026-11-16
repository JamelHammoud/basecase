import { describe, expect, it } from 'vitest';
import { galleryBundleBytes } from '../gallery/galleryBundle';
import { galleryBundles } from '../gallery/galleryEntries';
import { hashValue, hashBytes, validateManifest, validateEntry, verifyEntryBundle, verifyManifest } from './validation';
import { adjudicate, closeLeague, verifyFrozen } from './adjudication';
import { rankStandings, standingOf } from './ranking';
import type { LeagueEntry, LeagueManifest, LeagueOutcome } from './types';

const bundle = () => galleryBundles().find((b) => b.slug === 'rover-reach-the-flag')!;
const revision = 'a'.repeat(40);
const deadline = '2026-11-01T00:00:00.000Z';

function manifest(): LeagueManifest {
  const kase = bundle().case;

  return {
    formatVersion: 1,
    id: 'rover-sprint',
    title: 'Rover sprint',
    deadline,
    case: kase,
    caseHash: hashValue(kase),
    contractHash: hashValue(kase.task.contract),
    engine: { mujoco: '4.0.0', runner: revision },
    ranking: { score: 'margin', direction: 'higher' },
    seedCount: 2,
  };
}

function entry(id = 'round'): LeagueEntry {
  return {
    id,
    repo: 'tester/rover',
    revision,
    bundleHash: hashBytes(galleryBundleBytes(bundle())),
    enteredAt: deadline,
    budget: null,
  };
}

const outcome = (seed: number, score = 1): LeagueOutcome => ({
  seed,
  passed: score > 0,
  margin: score,
  score,
  failed: score > 0 ? [] : ['Reach the flag'],
});
const provenance = { repository: 'JamelHammoud/basecase', commit: revision, runId: 'fixture' };

describe('League admission and ranking', () => {
  it('binds frozen evidence to the pinned runner commit rather than a later workflow checkout', async () => {
    const pin = { ...manifest(), engine: { ...manifest().engine, commit: revision } };
    const closure = closeLeague({
      manifest: pin,
      entries: [entry()],
      now: '2026-11-02T00:00:00.000Z',
      entropy: 'f'.repeat(64),
    });
    const frozen = await adjudicate({
      manifest: pin,
      closure,
      provenance,
      replay: async (_, seed) => ({ outcome: outcome(seed), budget: 12 }),
    });

    expect(validateManifest(pin).engine.commit).toBe(revision);
    expect(() =>
      verifyFrozen(pin, closure.entries, frozen, { expectedHash: hashValue(frozen), closure }),
    ).not.toThrow();

    const changed = { ...frozen, provenance: { ...provenance, commit: 'b'.repeat(40) } };

    expect(() => verifyFrozen(pin, closure.entries, changed, { expectedHash: hashValue(changed), closure })).toThrow(
      'does not match',
    );
    expect(() => validateManifest({ ...pin, engine: { ...pin.engine, commit: 'main' } })).toThrow('commit');
  });

  it('pins a whole Case and contract and refuses executable content', () => {
    const pin = manifest();

    expect(validateManifest(pin)).toEqual(pin);
    expect(() => verifyManifest({ ...pin, contractHash: 'b'.repeat(64) })).toThrow('contract');
    expect(() => verifyEntryBundle(pin, entry(), galleryBundleBytes(bundle()))).not.toThrow();

    const changed = bundle();

    changed.case.name = 'Another Case';

    const bytes = galleryBundleBytes(changed);

    expect(() => verifyEntryBundle(pin, { ...entry(), bundleHash: hashBytes(bytes) }, bytes)).toThrow('Case');
    changed.case = bundle().case;
    changed.case.task.contract.failures.push({ label: 'Changed', formula: changed.case.task.contract.success });

    const contractBytes = galleryBundleBytes(changed);

    expect(() => verifyEntryBundle(pin, { ...entry(), bundleHash: hashBytes(contractBytes) }, contractBytes)).toThrow(
      'contract',
    );
    expect(() => verifyEntryBundle(pin, { ...entry(), revision: 'main' }, galleryBundleBytes(bundle()))).toThrow(
      'revision',
    );
  });

  it('refuses path-shaped entry identities and component ids before geometry loads', () => {
    expect(() => validateEntry({ ...entry(), id: '..' })).toThrow();

    const hostile = bundle();

    hostile.robot.parts[0] = { ...hostile.robot.parts[0], kind: 'component', componentId: '../../secrets' };

    const bytes = galleryBundleBytes(hostile);

    expect(() => verifyEntryBundle(manifest(), { ...entry(), bundleHash: hashBytes(bytes) }, bytes)).toThrow(
      'unsupported',
    );
  });

  it('orders passes, declared score direction, measured Budget, then stable identity', () => {
    const pin = manifest();
    const rows = [
      standingOf(entry('b'), [outcome(1)], 12),
      standingOf(entry('a'), [outcome(1)], 12),
      standingOf(entry('missing'), [outcome(1)], null),
      standingOf(entry('cheap'), [outcome(1)], 9),
      standingOf(entry('failed'), [outcome(1, -1)], 0),
      standingOf(entry('score'), [outcome(1, 2)], 50),
    ];

    expect(rankStandings(pin, rows).map((r) => r.entryId)).toEqual(['score', 'cheap', 'a', 'b', 'missing', 'failed']);
    expect(rankStandings({ ...pin, ranking: { score: 'margin', direction: 'lower' } }, rows)[0].entryId).toBe('cheap');
    expect(() => standingOf(entry(), [], null)).toThrow();
    expect(() => standingOf(entry(), [{ ...outcome(1), score: NaN }], null)).toThrow();
  });

  it('freezes closure once, ignores late entries and verifies complete trusted evidence', async () => {
    const pin = manifest();
    const closure = closeLeague({
      manifest: pin,
      entries: [entry(), { ...entry('late'), enteredAt: '2026-11-02T00:00:00.000Z' }],
      now: '2026-11-02T00:00:00.000Z',
      entropy: 'f'.repeat(64),
    });
    const replay = async (_: LeagueEntry, seed: number) => ({ outcome: outcome(seed), budget: 12 });
    const frozen = await adjudicate({ manifest: pin, closure, provenance, replay });
    const again = await adjudicate({ manifest: pin, closure, provenance, replay });

    expect(frozen).toEqual(again);
    expect(frozen.standings).toHaveLength(1);
    expect(() =>
      verifyFrozen(pin, closure.entries, frozen, { expectedHash: hashValue(frozen), closure }),
    ).not.toThrow();
    expect(() =>
      verifyFrozen(
        pin,
        closure.entries,
        { ...frozen, seedHash: 'e'.repeat(64) },
        { expectedHash: hashValue(frozen), closure },
      ),
    ).toThrow();
    expect(() => closeLeague({ manifest: pin, entries: [], now: deadline, entropy: 'f'.repeat(64) })).toThrow(
      'deadline',
    );
    await expect(
      adjudicate({
        manifest: pin,
        closure,
        provenance,
        replay: async () => {
          throw new Error('Interrupted');
        },
      }),
    ).rejects.toThrow('Interrupted');
  });
});
