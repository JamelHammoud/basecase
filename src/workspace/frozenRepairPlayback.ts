import { buildAlongSteps, type BuildAlongStep } from '../guide/buildAlong';
import type { BuildRepairRecord } from '../kit/buildRepairTypes';
import type { RepairDeclaration } from '../kit/buildRepairDeclarations';
import type { FrozenKit } from '../kit/frozenKit';

function declarationStep(action: RepairDeclaration, kit: FrozenKit): BuildAlongStep {
  return {
    shown: kit.manifest.guide.partIds,
    moves: [],
    arrows: [],
    tools: [],
    servos: [],
    callout: [],
    routes: action.net ? [action.net] : [],
    action: action.kind,
    repairPhase: action.kind === 'disconnect' ? 'remove' : 'reassemble',
  };
}

export function frozenRepairPlayback(repair: BuildRepairRecord, source: FrozenKit, target: FrozenKit) {
  const before = repair.plan.declarations.filter((action) => action.kind === 'disconnect');
  const after = repair.plan.declarations.filter((action) => action.kind !== 'disconnect');
  const phases = repair.plan.phases.flatMap((phase) => {
    const kit = phase.revision === 'source' ? source : target;

    return buildAlongSteps(phase.plan, kit.project.joints ?? []).map((step) => ({
      step: {
        ...step,
        printPartId:
          step.repairPhase === 'swap'
            ? target.manifest.printed.find((part) => repair.affected.includes(part.id))?.id
            : undefined,
      },
      revision: phase.revision,
    }));
  });
  const actions = [
    ...before.map((action) => ({ step: declarationStep(action, source), revision: 'source' as const })),
    ...phases,
    ...after.map((action) => ({ step: declarationStep(action, target), revision: 'target' as const })),
  ];

  return { steps: actions.map((action) => action.step), revisions: actions.map((action) => action.revision) };
}
