import { readFileSync } from 'node:fs';
import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it, vi } from 'vitest';
import { galleryBundleBytes } from '../gallery/galleryBundle';
import { galleryBundleOf } from '../gallery/buildBundle';
import { galleryBundles } from '../gallery/galleryEntries';
import { fixtureRobots } from '../sim/fixtures/robots';
import { presetCase } from '../cases/testing';
import { forgetComponentMesh } from '../three/componentMeshes';
import { adjudicate, closeLeague } from './adjudication';
import { roverLeagueFixture } from './fixtures';
import { replayLeagueSeed } from './replay';
import { hashBytes, hashValue, verifyEntryBundle } from './validation';

const provenance = { repository: 'JamelHammoud/basecase', commit: 'a'.repeat(40), runId: 'fixture' };

it('loads catalog geometry before browser measurement and refuses a missing model instead of using a box', async () => {
  const mj = await loadMujoco();
  const { manifest, entries, bundles } = roverLeagueFixture();
  const bundle = structuredClone(bundles[0]);
  const componentId = 'feetech-sts3215';
  const file = readFileSync(new URL(`../../public/parts/${componentId}.glb`, import.meta.url));
  const mesh = Uint8Array.from(file).buffer;

  bundle.robot.parts[0] = { ...bundle.robot.parts[0], kind: 'component', componentId };

  const bytes = galleryBundleBytes(bundle);
  const entry = { ...entries[0], bundleHash: hashBytes(bytes) };
  const fetch = vi.fn(async () => new Response(mesh));

  forgetComponentMesh(componentId);
  vi.stubGlobal('fetch', fetch);

  try {
    const browser = await replayLeagueSeed(mj, manifest, entry, { bytes, seed: 1 });

    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining(`${componentId}.glb`));
    forgetComponentMesh(componentId);
    vi.stubGlobal('fetch', async () => new Response('', { status: 404 }));
    await expect(replayLeagueSeed(mj, manifest, entry, { bytes, seed: 1 })).rejects.toThrow('couldn’t load');

    const adjudicated = await replayLeagueSeed(mj, manifest, entry, {
      bytes,
      seed: 1,
      meshes: { [componentId]: mesh },
    });

    expect(browser.outcome).toEqual(adjudicated.outcome);
    expect(browser.budget).toEqual(adjudicated.budget);
  } finally {
    forgetComponentMesh(componentId);
    vi.unstubAllGlobals();
  }
});

it('replays different rover bodies with held-back seeds and repeats every verdict and ranking', async () => {
  const mj = await loadMujoco();
  const { manifest, entries, bundles } = roverLeagueFixture();
  const closure = closeLeague({ manifest, entries, now: '2026-11-02T00:00:00.000Z', entropy: 'f'.repeat(64) });
  const replay = async (entry: (typeof entries)[number], seed: number) => {
    const bundle = bundles.find((candidate) => candidate.slug === entry.id)!;

    return replayLeagueSeed(mj, manifest, entry, { bytes: galleryBundleBytes(bundle), seed });
  };
  const frozen = await adjudicate({ manifest, closure, provenance, replay });
  const repeated = await adjudicate({ manifest, closure, provenance, replay });

  expect(frozen).toEqual(repeated);

  const shipped = JSON.parse(
    readFileSync(new URL('../../public/leagues/rover-sprint/results.json', import.meta.url), 'utf-8'),
  );

  expect(frozen.standings).toEqual(shipped.standings);
  expect(frozen.standings).toHaveLength(2);
  expect(frozen.standings[0].score).not.toEqual(frozen.standings[1].score);

  const failed = frozen.standings
    .flatMap((standing) => standing.outcomes.map((outcome) => ({ standing, outcome })))
    .find(({ outcome }) => !outcome.passed)!;
  const entry = entries.find((candidate) => candidate.id === failed.standing.entryId)!;
  const selected = await replay(entry, failed.outcome.seed);

  expect(selected.outcome).toEqual(failed.outcome);
  expect(selected.outcome.failed.length).toBeGreaterThan(0);
});

describe('one League format across robot families', () => {
  it('accepts two arm bodies on another pinned Case', () => {
    const arms = fixtureRobots().filter((robot) => ['arm-3dof', 'arm-6dof'].includes(robot.id));
    const kase = presetCase(arms[0], 'touch-the-dots');
    const { manifest, entries } = roverLeagueFixture();
    const armManifest = {
      ...manifest,
      id: 'arm-touch',
      case: kase,
      caseHash: hashValue(kase),
      contractHash: hashValue(kase.task.contract),
    };

    for (const robot of arms) {
      const bundle = galleryBundleOf({
        slug: robot.id,
        title: robot.id,
        robotName: robot.id,
        parts: robot.parts,
        joints: robot.joints,
        kase,
      });
      const bytes = galleryBundleBytes(bundle);

      expect(
        verifyEntryBundle(armManifest, { ...entries[0], robotName: robot.id, bundleHash: hashBytes(bytes) }, bytes)
          .robot.parts,
      ).toEqual(robot.parts);
    }
  });

  it('refuses executable panels and oversized or malformed bundle bytes', () => {
    const { manifest, entries } = roverLeagueFixture();

    expect(() => verifyEntryBundle(manifest, entries[0], new Uint8Array(9 * 1024 * 1024))).toThrow();
    expect(() => verifyEntryBundle(manifest, entries[0], new TextEncoder().encode('{'))).toThrow();

    const bundle = galleryBundles()[0];

    bundle.case.logic = { id: 'hostile' } as unknown as NonNullable<typeof bundle.case.logic>;

    expect(() =>
      verifyEntryBundle(
        {
          ...manifest,
          case: bundle.case,
          caseHash: hashValue(bundle.case),
          contractHash: hashValue(bundle.case.task.contract),
        },
        entries[0],
        galleryBundleBytes(bundle),
      ),
    ).toThrow('unsupported');
  });
});

it('keeps a hexapod’s retained policy in the accepted immutable bundle and seed replay', async () => {
  const mj = await loadMujoco();
  const bundle = galleryBundles().find((candidate) => candidate.slug === 'hexapod-reach-the-flag')!;
  const joints = bundle.robot.joints.map((joint) => joint.id);
  const width = 12 + joints.length * 3;

  bundle.case.task.seconds = 0.1;
  bundle.case.task.contract = {
    version: 1,
    success: {
      always: {
        window: 'whole',
        state: { atom: { expr: { signal: 'spot' }, cmp: '<', value: 1_000_000, scale: 1_000_000 } },
      },
    },
    failures: [],
  };
  bundle.trained = {
    kind: 'policy',
    record: {
      id: 'policy-retained',
      name: 'Retained walk',
      task: 'walk',
      robot: 'Hexapod',
      robotName: 'Hexapod',
      command: [0, 0, 0],
      trainedSteps: 100,
      createdAt: '2026-10-31T00:00:00.000Z',
    },
    spec: {
      format: 'basecase-policy',
      version: 1,
      task: 'walk',
      robot: 'Hexapod',
      joints,
      defaultPose: joints.map(() => 0),
      actionScale: 0.25,
      controlDt: 0.02,
      command: [0, 0, 0],
      obsMean: Array.from({ length: width }, () => 0),
      obsStd: Array.from({ length: width }, () => 1),
      layers: [
        {
          in: width,
          out: joints.length,
          w: Array.from({ length: width * joints.length }, () => 0),
          b: joints.map(() => 0),
        },
      ],
      activation: 'elu',
      trainedSteps: 100,
      mujoco: '4.0.0',
      createdAt: '2026-10-31T00:00:00.000Z',
    },
  };

  const { manifest, entries } = roverLeagueFixture();
  const hexManifest = {
    ...manifest,
    case: bundle.case,
    caseHash: hashValue(bundle.case),
    contractHash: hashValue(bundle.case.task.contract),
  };
  const bytes = galleryBundleBytes(bundle);
  const entry = { ...entries[0], robotName: bundle.robot.name, bundleHash: hashBytes(bytes) };
  const accepted = verifyEntryBundle(hexManifest, entry, bytes);
  const replay = await replayLeagueSeed(mj, hexManifest, entry, { bytes, seed: 1, record: true });

  expect(accepted.trained).toEqual(bundle.trained);
  expect(replay.result.recording?.controller?.kind).toBe('policy');
});
