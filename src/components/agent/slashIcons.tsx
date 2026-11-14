import type React from 'react';
import type { SlashName } from '../../agent/slashCommands';
import { CameraIcon, CasesIcon, CheckIcon, RoutinesIcon, RunIcon, TrainIcon } from '../../design-system';

export const SLASH_ICONS: Record<SlashName, React.ReactNode> = {
  train: <TrainIcon />,
  routine: <RoutinesIcon />,
  case: <CasesIcon />,
  simulate: <RunIcon />,
  operate: <CameraIcon />,
  check: <CheckIcon />,
};
