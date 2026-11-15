import type { Purchases } from '../types/robotics';
import { robotTotals } from '../cases/caseCompare';
import type { CaseRuns } from '../cases/caseRuns';
import { designChanges, type ExploreBase, type ExploreRobot, type ExploredDesign } from '../cases/explore';
import { designKey, designScene, exploreDesigns, exploreSpace, type Design } from '../cases/exploreDesigns';

interface ReferenceExploreOptions {
  runs: (robot: ExploreRobot) => Promise<CaseRuns>;
  purchases: Purchases;
  designs?: Design[];
  stopped?: () => boolean;
  onDesign?: (row: ExploredDesign) => void;
}

export async function referenceExploreCase(
  base: ExploreBase,
  options: ReferenceExploreOptions,
): Promise<ExploredDesign[]> {
  const space = exploreSpace(base.parts, base.project);

  if (!space) return [];

  const rows: ExploredDesign[] = [];

  for (const design of options.designs ?? exploreDesigns(space)) {
    if (options.stopped?.()) break;

    const scene = designScene(base, space, design);
    const runs = await options.runs({ ...base, ...scene, servoVolts: design.volts });

    if (options.stopped?.()) break;

    const row: ExploredDesign = {
      key: designKey(design),
      design,
      changes: designChanges(space, design),
      runs,
      ...robotTotals({ ...scene, measures: base.measures }, options.purchases),
    };

    rows.push(row);
    options.onDesign?.(row);
  }

  return rows;
}
