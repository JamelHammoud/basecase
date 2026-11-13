import {
  AlignBottomIcon,
  AlignCenterXIcon,
  AlignCenterYIcon,
  AlignLeftIcon,
  AlignRightIcon,
  AlignTopIcon,
  SpreadXIcon,
  SpreadYIcon,
  type GlyphIcon,
} from '../design-system';
import type { AlignMode, Axis } from '../utils/selection';

export interface AlignAction {
  id: string;
  label: string;
  side: string;
  keywords: string;
  mode: AlignMode;
  icon: GlyphIcon;
}

export interface AlignAxis {
  axis: Axis;
  name: string;
  spread: { id: string; label: string; icon: GlyphIcon };
  aligns: AlignAction[];
}

export const ALIGN_AXES: AlignAxis[] = [
  {
    axis: 0,
    name: 'X',
    spread: { id: 'spread-x', label: 'Spread Along X', icon: SpreadXIcon },
    aligns: [
      { id: 'align-left', label: 'Align Left', side: 'Left', keywords: 'x', mode: 'min', icon: AlignLeftIcon },
      {
        id: 'align-center-x',
        label: 'Align Center (X)',
        side: 'Center',
        keywords: 'x',
        mode: 'center',
        icon: AlignCenterXIcon,
      },
      { id: 'align-right', label: 'Align Right', side: 'Right', keywords: 'x', mode: 'max', icon: AlignRightIcon },
    ],
  },
  {
    axis: 1,
    name: 'Y',
    spread: { id: 'spread-y', label: 'Spread Along Y', icon: SpreadYIcon },
    aligns: [
      {
        id: 'align-bottom',
        label: 'Align Bottom',
        side: 'Bottom',
        keywords: 'y floor',
        mode: 'min',
        icon: AlignBottomIcon,
      },
      {
        id: 'align-middle',
        label: 'Align Middle',
        side: 'Middle',
        keywords: 'y center',
        mode: 'center',
        icon: AlignCenterYIcon,
      },
      { id: 'align-top', label: 'Align Top', side: 'Top', keywords: 'y', mode: 'max', icon: AlignTopIcon },
    ],
  },
  {
    axis: 2,
    name: 'Z',
    spread: { id: 'spread-z', label: 'Spread Along Z', icon: SpreadXIcon },
    aligns: [
      { id: 'align-back', label: 'Align Back', side: 'Back', keywords: 'z', mode: 'min', icon: AlignLeftIcon },
      {
        id: 'align-center-z',
        label: 'Align Center (Z)',
        side: 'Center',
        keywords: 'z',
        mode: 'center',
        icon: AlignCenterXIcon,
      },
      { id: 'align-front', label: 'Align Front', side: 'Front', keywords: 'z', mode: 'max', icon: AlignRightIcon },
    ],
  },
];

export const singlePartAlignTitle = (axis: Axis, action: AlignAction) =>
  axis === 1 && action.mode === 'min' ? 'Bottom to floor' : `${action.side} to origin`;
