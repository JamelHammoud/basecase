import type React from 'react';
import {
  CommentIcon,
  GroupIcon,
  HistoryIcon,
  LookIcon,
  RefreshIcon,
  RotateLeftIcon,
  SparklesIcon,
  StopIcon,
  SwapIcon,
  ThoughtIcon,
  TrainIcon,
  WalkIcon,
} from '../../design-system';
import type { StepIcon } from '../../routines/stepMenu';

type Icon = React.FC<{ className?: string }>;

export const STEP_ICONS: Record<StepIcon, Icon> = {
  drive: WalkIcon,
  turn: RotateLeftIcon,
  stop: StopIcon,
  skill: TrainIcon,
  anySkill: SparklesIcon,
  say: CommentIcon,
  ask: ThoughtIcon,
  wait: HistoryIcon,
  if: SwapIcon,
  repeat: RefreshIcon,
  together: GroupIcon,
  see: LookIcon,
  hear: CommentIcon,
};
