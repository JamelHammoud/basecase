import { beforeEach, describe, expect, it, vi } from 'vitest';
import { presetCase } from '../cases/caseBuilder';
import { galleryBundleOf } from '../gallery/buildBundle';
import { galleryBundleBytes } from '../gallery/galleryBundle';
import { hubBridge } from '../hub/hubBridge';
import { hashBytes, hashValue } from '../leagues/validation';
import type { LeagueManifest } from '../leagues/types';
import { fixtureRobot } from '../skills/fixtureModels';
import { buildRig } from '../utils/kinematics';
import { enterLeague } from './enterLeague';

vi.mock('../hub/hubBridge', () => ({ hubBridge: { publish: vi.fn() } }));

const rover = fixtureRobot('rover-diff');
const kase = presetCase('reach-the-flag', buildRig(rover.joints, rover.parts), rover.parts);
const bundle = galleryBundleOf({
  slug: 'rover',
  title: 'Rover',
  robotName: 'Rover',
  parts: rover.parts,
  joints: rover.joints,
  kase,
});
const revision = 'a'.repeat(40);
const now = '2026-11-15T12:00:00.000Z';

async function manifest(): Promise<LeagueManifest> {
  return {
    formatVersion: 1,
    id: 'rover-sprint',
    title: 'Rover sprint',
    deadline: '2026-11-16T00:00:00.000Z',
    case: kase,
    caseHash: await hashValue(kase),
    contractHash: await hashValue(kase.task.contract),
    engine: { mujoco: '4.0.0', runner: 'a'.repeat(40) },
    ranking: { score: 'margin', direction: 'higher' },
    seedCount: 2,
  };
}

beforeEach(() => {
  vi.mocked(hubBridge.publish).mockReset().mockResolvedValue({ repo: 'tester/rover', url: '', revision });
});

describe('League entry from Share Robot', () => {
  it('pins the acknowledged bundle revision and publishes its manifest binding separately', async () => {
    const pinned = await manifest();
    const result = await enterLeague({ bundle, manifest: pinned, now });
    const calls = vi.mocked(hubBridge.publish).mock.calls;
    const record = JSON.parse(new TextDecoder().decode(calls[1][0].files['league-entry.json']));

    expect(calls).toHaveLength(2);
    expect(calls[0][0].includeRevision).toBe(true);
    expect(record.manifestHash).toBe(await hashValue(pinned));
    expect(record.entry.revision).toBe(revision);
    expect(record.entry.bundleHash).toBe(await hashBytes(galleryBundleBytes(bundle)));
    expect(record.entry.budget).toBeNull();
    expect(result.revision).toBe(revision);
  });

  it('refuses a changed Case before any publication', async () => {
    await expect(
      enterLeague({ bundle: { ...bundle, case: { ...kase, id: 'another-case' } }, manifest: await manifest(), now }),
    ).rejects.toThrow(/Case/);
    expect(hubBridge.publish).not.toHaveBeenCalled();
  });

  it('refuses a changed contract before any publication', async () => {
    const changed = {
      ...bundle,
      case: {
        ...kase,
        task: {
          ...kase.task,
          contract: {
            ...kase.task.contract,
            failures: [...kase.task.contract.failures, { label: 'Changed', formula: kase.task.contract.success }],
          },
        },
      },
    };

    await expect(enterLeague({ bundle: changed, manifest: await manifest(), now })).rejects.toThrow();
    expect(hubBridge.publish).not.toHaveBeenCalled();
  });

  it('refuses entry after the deadline before publishing', async () => {
    await expect(enterLeague({ bundle, manifest: await manifest(), now: '2026-11-17T00:00:00.000Z' })).rejects.toThrow(
      /closed|deadline/i,
    );
    expect(hubBridge.publish).not.toHaveBeenCalled();
  });

  it('refuses a moving branch receipt without publishing entry evidence', async () => {
    vi.mocked(hubBridge.publish).mockResolvedValue({ repo: 'tester/rover', url: '', revision: 'main' });
    await expect(enterLeague({ bundle, manifest: await manifest(), now })).rejects.toThrow(/revision|commit/i);
    expect(hubBridge.publish).toHaveBeenCalledTimes(1);
  });

  it('refuses a moving submission receipt after publishing the pinned robot', async () => {
    vi.mocked(hubBridge.publish)
      .mockResolvedValueOnce({ repo: 'tester/rover', url: '', revision })
      .mockResolvedValueOnce({ repo: 'tester/submission', url: '', revision: 'main' });

    await expect(enterLeague({ bundle, manifest: await manifest(), now })).rejects.toThrow(/commit/i);
    expect(hubBridge.publish).toHaveBeenCalledTimes(2);
  });
});
