import type { Viewport3DHandle } from '../components/Viewport3D';
import type { LightenFrozen } from '../strength/lightenTypes';
import type { StrengthJob } from '../strength/types';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import { runEngineering } from '../utils/engineering';
import { engineeringInputs } from './engineeringNow';
import { frozenInterfaces } from './lightenInterfaces';
import { freshWalk } from './storedWalk';
import { awaitPartModels } from './agentPartModels';

export async function lightenLoads(
  viewport: Viewport3DHandle,
  parts: ScenePart[],
  project: ProjectSettings,
  partId: string,
): Promise<{ jobs: StrengthJob[]; frozen: LightenFrozen }> {
  const part = parts.find((candidate) => candidate.id === partId);

  if (!part) throw new Error(`Part ${partId} was not found.`);

  await awaitPartModels('lighten_part', viewport);

  const input = await engineeringInputs(viewport, parts, project);
  const jobs: StrengthJob[] = [];

  runEngineering({
    ...input,
    walk: freshWalk(parts, project),
    strength: (asked) => {
      jobs.push(...asked.filter((job) => job.part === partId));

      return asked.map(() => null);
    },
  });

  if (!jobs.length) throw new Error(`${part.name} has no measured Strength load path to lighten.`);

  const measure = input.measures[partId];

  if (!measure) throw new Error(`${part.name} has no measured geometry to lighten.`);

  try {
    return { jobs, frozen: frozenInterfaces({ part, parts, chains: input.chains, measure }) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'its interfaces could not be measured.';
    const named = reason.startsWith(`${part.name}:`) ? reason : `${part.name}: ${reason}`;

    throw new Error(named, { cause: error });
  }
}
