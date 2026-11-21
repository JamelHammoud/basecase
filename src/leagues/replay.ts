import type { MainModule } from '@mujoco/mujoco';
import { caseRunner } from '../cases/runCase';
import { refuse } from '../cases/validate';
import type { GalleryBundle } from '../gallery/galleryBundle';
import { headlessParts } from '../three/headlessParts';
import { componentMeshesReady, provideMeshFiles, type MeshFiles } from '../three/componentMeshes';
import type { PolicySpec } from '../sim/policy';
import { leagueBudget } from './leagueBudget';
import type { LeagueEntry, LeagueManifest, LeagueOutcome } from './types';
import { LEAGUE_RUNNER_VERSION, verifyEntryBundle } from './validation';

function retainedPolicy(bundle: GalleryBundle): PolicySpec | null {
  const trained = bundle.trained;

  if (!trained) return null;

  if (trained.kind === 'policy') return trained.spec;

  const controller = trained.skill.controller;

  if (controller.kind === 'policy') return controller.policy;

  return refuse('League policy', 'uses an unsupported controller');
}

interface ReplayOptions {
  bytes: Uint8Array;
  seed: number;
  record?: boolean;
  meshes?: MeshFiles;
}

export async function replayLeagueSeed(
  mj: MainModule,
  manifest: LeagueManifest,
  entry: LeagueEntry,
  options: ReplayOptions,
) {
  if (mj.mj_versionString() !== manifest.engine.mujoco || manifest.engine.runner !== LEAGUE_RUNNER_VERSION)
    return refuse('League engine', 'does not match');

  if (!Number.isInteger(options.seed) || options.seed < 0 || options.seed > 0xffffffff)
    return refuse('League seed', 'is outside its limits');

  const bundle = verifyEntryBundle(manifest, entry, options.bytes);

  provideMeshFiles(options.meshes);

  const components = bundle.robot.parts.flatMap((part) =>
    part.kind === 'component' && part.componentId ? [part.componentId] : [],
  );
  const missing = await componentMeshesReady(components);

  if (missing.length) return refuse('League robot', `couldn’t load ${missing.join(', ')}`);

  const loaded = await headlessParts(bundle.robot.parts, bundle.robot.joints, {});
  const policy = retainedPolicy(bundle);
  const runner = caseRunner(
    mj,
    manifest.case,
    { id: bundle.slug, parts: bundle.robot.parts, ...loaded },
    {
      controller: policy ? 'policy' : 'reference',
      policy,
      record: options.record,
    },
  );

  if (runner.refusal) return refuse('League robot', runner.refusal);

  const result = await runner.run(options.seed);

  if (result.refusal) return refuse('League result', result.refusal);

  const score = manifest.ranking.score === 'margin' ? result.margin : result.trace.signals.score?.at(-1);

  if (score === undefined || !Number.isFinite(score)) return refuse('League score', 'has no measurement');

  const outcome: LeagueOutcome = {
    seed: options.seed,
    passed: result.passed,
    margin: result.margin,
    score,
    failed: result.failed,
  };
  const budget = leagueBudget(bundle, loaded.measures, manifest);

  return { outcome, result, budget };
}
