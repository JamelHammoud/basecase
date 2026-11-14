import type { Command } from '../components/CommandPalette';
import { DownloadIcon, ShareIcon } from '../design-system';
import type { CommandInputs } from './sceneCommands';

const ic = 'w-4 h-4';

export function skillCommands({ core }: CommandInputs): Command[] {
  const { skillHub } = core.simTraining;
  const install: Command = {
    id: 'skill-install',
    group: 'Simulate',
    label: 'Install Skill',
    icon: <DownloadIcon className={ic} />,
    keywords: 'hugging face hub hf download skill policy motor kit stand walk exchange',
    run: skillHub.openInstall,
  };
  const publish = skillHub.publishable.map((row): Command => ({
    id: `skill-publish-${row.target}`,
    group: 'Simulate',
    label: `Publish ${row.label} to Hugging Face`,
    icon: <ShareIcon className={ic} />,
    keywords: 'hub hf upload share skill policy model onnx',
    run: () => skillHub.publish(row),
  }));

  return [...(skillHub.canInstall ? [install] : []), ...publish];
}
