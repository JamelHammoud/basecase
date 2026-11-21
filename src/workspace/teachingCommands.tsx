import type { Command } from '../components/CommandPalette';
import { RunIcon, SwapIcon } from '../design-system';
import type { WorkspaceCore } from './useWorkspaceCore';
import { selectCorrections } from './selectCorrections';
import { errorMessage } from '../utils/errorMessage';

export function chooseCorrections(core: WorkspaceCore, ids: string[]) {
  const dataset = core.triesView.dataset;

  if (!dataset || dataset.selectedVersion) return;

  void core.simTraining.sim
    .buildModel()
    .then((model) => selectCorrections({ dataset, ids, model }))
    .catch((error: unknown) => core.simTraining.cases.showError(errorMessage(error)));
}

export function correctionCommands(core: WorkspaceCore): Command[] {
  if (
    !core.triesView.open ||
    !core.triesView.dataset ||
    core.triesView.dataset.selectedVersion ||
    !core.triesView.selected.length
  )
    return [];

  return [
    {
      id: 'dataset-corrections',
      group: 'Simulate',
      label: 'Use Corrections',
      icon: <SwapIcon />,
      run: () => chooseCorrections(core, core.triesView.selected),
    },
  ];
}

export function teachingCommands(core: WorkspaceCore): Command[] {
  const { cases } = core.simTraining;
  const { attempt } = cases;

  if (attempt.phase === 'running' && attempt.owner)
    return [
      {
        id: 'case-handoff',
        group: 'Simulate',
        label: attempt.owner === 'operator' ? 'Resume Policy' : 'Take Control',
        icon: <SwapIcon />,
        run: () => void attempt.handoff?.(),
      },
    ];

  if (!cases.canTeach || attempt.phase !== 'idle' || cases.realTry.phase !== 'idle') return [];

  return [
    { id: 'case-teach', group: 'Simulate', label: 'Try Policy', icon: <RunIcon />, run: () => void attempt.teach?.() },
  ];
}
