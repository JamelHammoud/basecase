import type React from 'react';
import { SLASH_COMMANDS, slashText, type SlashName } from '../agent/slashCommands';
import type { Command } from '../components/CommandPalette';
import { CasesIcon, CheckIcon, RoutinesIcon, RunIcon, TrainIcon } from '../design-system';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import type { CommandInputs } from './sceneCommands';

const ic = 'w-4 h-4';

const ICONS: Record<SlashName, React.ReactNode> = {
  train: <TrainIcon className={ic} />,
  routine: <RoutinesIcon className={ic} />,
  case: <CasesIcon className={ic} />,
  simulate: <RunIcon className={ic} />,
  check: <CheckIcon className={ic} />,
};

export function slashPaletteCommands({ core }: CommandInputs): Command[] {
  if (IS_WEB_DEMO) return [];

  return SLASH_COMMANDS.map((command) => ({
    id: `agent-slash-${command.name}`,
    group: 'Agent',
    label: command.label,
    icon: ICONS[command.name],
    keywords: `/${command.name} ${command.keywords} agent`,
    run: () => core.tool.requestCompose(slashText(command.name)),
  }));
}
