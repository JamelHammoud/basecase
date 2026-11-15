import type { Command } from '../components/CommandPalette';
import { PhotoIcon } from '../design-system';
import type { WorkspaceCore } from './useWorkspaceCore';

export function frameLabelCommands(core: WorkspaceCore): Command[] {
  const { frameLabels, triesView, simTraining } = core;
  const { timeline } = simTraining.cases;
  const ids = timeline.record ? [timeline.record.id] : triesView.selected;

  if (!ids.length || frameLabels.loading || frameLabels.running) return [];

  return [
    {
      id: 'add-frames',
      group: 'Simulate',
      label: 'Add Frames',
      icon: <PhotoIcon />,
      keywords: 'label objects images dataset camera frame annotation boxes masks polygon',
      run: () => frameLabels.start(ids, timeline.record ? timeline.frame : 0),
    },
  ];
}
