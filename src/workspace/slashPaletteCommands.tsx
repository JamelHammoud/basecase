import type React from 'react';
import { SLASH_COMMANDS, slashText, type SlashName } from '../agent/slashCommands';
import type { Command } from '../components/CommandPalette';
import { CameraIcon, CasesIcon, CheckIcon, RoutinesIcon, RunIcon, TrainIcon } from '../design-system';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import type { CommandInputs } from './sceneCommands';

const ic = 'w-4 h-4';

const ICONS: Record<SlashName, React.ReactNode> = {
  train: <TrainIcon className={ic} />,
  routine: <RoutinesIcon className={ic} />,
  case: <CasesIcon className={ic} />,
  simulate: <RunIcon className={ic} />,
  operate: <CameraIcon className={ic} />,
  check: <CheckIcon className={ic} />,
};

const FAILING = new Set(['fail', 'warn']);

function makeItPass({ core }: CommandInputs): Command[] {
  const kase = core.simTraining.cases.active;
  const row = kase && core.readiness.current?.rows.find((r) => r.caseId === kase.id);

  if (!kase || !row || !FAILING.has(row.status)) return [];

  return [
    {
      id: 'agent-make-it-pass',
      group: 'Agent',
      label: 'Make It Pass',
      icon: <CasesIcon className={ic} />,
      keywords: `/pass ${kase.name} case fix redesign agent`,
      run: () => core.tool.requestCompose(`/pass ${kase.name}`),
    },
  ];
}

export function slashPaletteCommands(inputs: CommandInputs): Command[] {
  if (IS_WEB_DEMO) return [];

  return [
    ...makeItPass(inputs),
    ...SLASH_COMMANDS.map((command) => ({
      id: `agent-slash-${command.name}`,
      group: 'Agent',
      label: command.label,
      icon: ICONS[command.name],
      keywords: `/${command.name} ${command.keywords} agent`,
      run: () => inputs.core.tool.requestCompose(slashText(command.name)),
    })),
  ];
}
