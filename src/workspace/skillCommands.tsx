import type { Command } from '../components/CommandPalette';
import { DownloadIcon, ShareIcon } from '../design-system';
import type { CommandInputs } from './sceneCommands';

export function skillCommands({ core }: CommandInputs): Command[] {
  const { skillHub } = core.simTraining;
  const install: Command = {
    id: 'skill-install',
    group: 'Simulate',
    label: 'Install Skill',
    icon: <DownloadIcon />,
    keywords: 'hugging face hub hf download skill policy motor kit stand walk exchange',
    run: skillHub.openInstall,
  };
  const publish = skillHub.publishable.map((row): Command => ({
    id: `skill-publish-${row.target}`,
    group: 'Simulate',
    label: `Publish ${row.label} to Hugging Face`,
    icon: <ShareIcon />,
    keywords: 'hub hf upload share skill policy model onnx',
    run: () => skillHub.publish(row),
  }));

  return [...(skillHub.canInstall ? [install] : []), ...publish];
}
