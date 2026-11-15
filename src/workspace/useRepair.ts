import type { RefObject } from 'react';
import { repairInWorker } from '../guide/repairClient';
import { isBuilt } from '../guide/guidePlan';
import type { GuidePlan } from '../guide/guideTypes';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import { boughtKey, isPrinted } from '../utils/bom';
import { errorMessage } from '../utils/errorMessage';
import { partBounds } from '../utils/selection';
import { plural } from '../../electron/plural.mjs';
import { awaitPartModels } from './agentPartModels';
import type { BuildAlong } from './useBuildAlong';
import type { BuildGuide } from './useBuildGuide';
import type { Printing } from './usePrinting';
import type { Viewport3DHandle } from '../components/Viewport3D';

interface RepairOptions {
  partsRef: RefObject<ScenePart[]>;
  projectRef: RefObject<ProjectSettings>;
  viewportRef: RefObject<Viewport3DHandle | null>;
  guide: BuildGuide;
  buildAlong: BuildAlong;
  printing: Printing;
}

export const canRepair = (part: ScenePart) => isBuilt(part) && (isPrinted(part) || !!boughtKey(part));

export function useRepair(options: RepairOptions) {
  'use memo';

  const { partsRef, projectRef, viewportRef, guide, buildAlong, printing } = options;

  const open = async (id: string): Promise<{ text: string; plan?: GuidePlan }> => {
    const parts = partsRef.current;
    const part = parts.find((p) => p.id === id);
    let text = `Couldn’t find a teardown for ${part?.name ?? id}. Run Checks in Build.`;

    if (!part || !canRepair(part)) return { text };

    const joints = projectRef.current.joints;
    const plan = await buildAlong.openPlan(async () => {
      try {
        const viewport = viewportRef.current;

        if (!viewport || parts.some((p) => p.cad?.pending)) return null;

        await awaitPartModels('repair_part', viewport);

        const geometry = await viewport.assembly({ serviceable: [id], budgetMs: 20000 });
        const guidePlan = await guide.currentPlan({ beforePdf: true });

        if (!guidePlan || parts !== partsRef.current || joints !== projectRef.current.joints) return null;

        const groups = Object.fromEntries(parts.map((p) => [p.id, p.group?.id]));

        const repairPlan = await repairInWorker({
          plan: guidePlan,
          groups,
          target: id,
          geometry,
          boxes: Object.fromEntries(parts.map((entry) => [entry.id, partBounds(entry)])),
        });

        return parts === partsRef.current && joints === projectRef.current.joints ? repairPlan : null;
      } catch (error) {
        text = `Couldn’t repair ${part.name}. ${errorMessage(error)}`;

        return null;
      }
    });

    if (!plan) return { text };

    if (plan.repair?.printed) printing.markForReprint(id);

    return { text: `Repair ${part.name}: ${plural(plan.steps.length, 'step')}.`, plan };
  };

  return { open };
}
