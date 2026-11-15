import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Viewport3DHandle } from '../components/Viewport3D';
import { objectsOf } from '../assembly/assembly.fixtures';
import { fastenerInput } from '../assembly/fastenerSpec';
import { fastenersIn, measuresIn } from '../three/analysis/analysisPool';
import { snapshotShapes } from '../three/analysis/sceneShapes';
import { L_BRACKET, lBracketScene } from '../strength/fixtures/lBracket';
import { runEngineering } from '../utils/engineering';
import type { StrengthJob } from '../strength/types';
import { engineeringInputs } from './engineeringNow';
import { lightenLoads } from './lightenLoads';
import { freshWalk, storedWalk, walkKey } from './storedWalk';

vi.mock('../utils/platformBridge', () => ({ platformBridge: { listPurchases: vi.fn(async () => ({})) } }));

beforeEach(() => vi.clearAllMocks());

async function measuredScene() {
  const { parts, project } = lBracketScene();
  const scene = snapshotShapes(objectsOf(parts));
  const [chains, measures] = await Promise.all([fastenersIn(scene, fastenerInput(parts)), measuresIn(scene)]);
  const viewport = {
    meshesReady: vi.fn(async () => {}),
    fastenerChains: vi.fn(async () => chains),
    measureParts: vi.fn(async () => measures),
    meshGaps: vi.fn(async () => []),
    servoOutput: vi.fn(() => undefined),
  } as unknown as Viewport3DHandle;

  return { parts, project, viewport, chains };
}

describe('Lighten load collection', () => {
  it('names an unusable mounting port once in the refusal', async () => {
    const { parts, project, viewport } = await measuredScene();
    const part = parts.find((candidate) => candidate.id === L_BRACKET)!;

    part.cad!.ports = [{ name: 'mount', position: [0, 0, 0], axis: [0, 0, 1], kind: 'bore' }];

    await expect(lightenLoads(viewport, parts, project, L_BRACKET)).rejects.toHaveProperty(
      'message',
      `${part.name}: mount needs a measured diameter before lightening.`,
    );
  });

  it('refuses placeholder component geometry from the shared menu and agent action', async () => {
    const { parts, project, viewport } = await measuredScene();

    vi.mocked(viewport.meshesReady).mockResolvedValue(['feetech-sts3215']);

    await expect(lightenLoads(viewport, parts, project, L_BRACKET)).rejects.toThrow('measure a box in its place');
    expect(viewport.fastenerChains).not.toHaveBeenCalled();
    expect(viewport.measureParts).not.toHaveBeenCalled();
  });

  it('uses every Strength job, including the saved walking peak, with the same world coordinates', async () => {
    const { parts, project, viewport, chains } = await measuredScene();

    project.joints!.push({ ...project.joints![0], id: 'second-load' });
    project.walk = {
      key: walkKey(parts, project),
      policy: 'walk',
      seconds: 3,
      fellAt: null,
      joints: { shoulder: { p99Nm: 4.2, rmsNm: 1, overS: 0 } },
    };

    const input = await engineeringInputs(viewport, parts, project);
    const expected: StrengthJob[] = [];

    runEngineering({
      ...input,
      walk: freshWalk(parts, project),
      strength: (jobs) => {
        expected.push(...jobs.filter((job) => job.part === L_BRACKET));

        return jobs.map(() => null);
      },
    });

    const result = await lightenLoads(viewport, parts, project, L_BRACKET);

    expect(expected).toHaveLength(2);
    expect(result.jobs).toEqual(expected);
    expect(result.jobs[0].load.torqueNmm).toBe(4200);
    expect(result.frozen.lines!.length).toBeGreaterThanOrEqual(chains.screws.length);
    await expect(lightenLoads(viewport, parts, project, 'payload')).rejects.toThrow('Payload');
    await expect(lightenLoads(viewport, parts, project, 'absent')).rejects.toThrow('absent');
  });

  it('ignores a saved walking peak after a load-bearing part changes', async () => {
    const { parts, project, viewport } = await measuredScene();

    project.walk = storedWalk(
      {
        policy: 'walk',
        seconds: 3,
        fellAt: null,
        joints: { shoulder: { p99Nm: 42, rmsNm: 1, overS: 0 } },
      },
      parts,
      project,
    );

    const payload = parts.find((part) => part.id === 'payload')!;

    payload.massG = payload.massG! + 100;

    expect(freshWalk(parts, project)).toBeUndefined();

    const baseline = await lightenLoads(viewport, parts, { ...project, walk: undefined }, L_BRACKET);
    const stale = await lightenLoads(viewport, parts, project, L_BRACKET);

    expect(stale.jobs).toEqual(baseline.jobs);
    expect(stale.jobs[0].load.torqueNmm).toBeLessThan(42000);
  });
});
