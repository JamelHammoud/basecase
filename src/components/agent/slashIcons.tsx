import type React from 'react';
import type { SlashName } from '../../agent/slashCommands';
import { CameraIcon, CasesIcon, CheckIcon, RoutinesIcon, RunIcon, TrainIcon } from '../../design-system';

const ic = 'w-4 h-4';

export const SLASH_ICONS: Record<SlashName, React.ReactNode> = {
  train: <TrainIcon className={ic} />,
  routine: <RoutinesIcon className={ic} />,
  case: <CasesIcon className={ic} />,
  simulate: <RunIcon className={ic} />,
  operate: <CameraIcon className={ic} />,
  check: <CheckIcon className={ic} />,
};
