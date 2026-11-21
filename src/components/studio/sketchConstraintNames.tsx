import React from 'react';
import {
  CoincidentIcon,
  EqualIcon,
  HorizontalIcon,
  ParallelIcon,
  PerpendicularIcon,
  TangentIcon,
  VerticalIcon,
  RulerIcon,
} from '../../design-system';
import type { GlyphKind } from './sketchMarks';

export const CONSTRAINT_NAMES: Record<GlyphKind | 'distance', string> = {
  distance: 'Distance',
  horizontal: 'Horizontal',
  vertical: 'Vertical',
  parallel: 'Parallel',
  perpendicular: 'Perpendicular',
  equal: 'Equal',
  tangent: 'Tangent',
  coincident: 'Coincident',
};

const ICONS: Record<GlyphKind, React.FC<{ className?: string }>> = {
  horizontal: HorizontalIcon,
  vertical: VerticalIcon,
  parallel: ParallelIcon,
  perpendicular: PerpendicularIcon,
  equal: EqualIcon,
  tangent: TangentIcon,
  coincident: CoincidentIcon,
};

export const ConstraintIcon: React.FC<{ kind: GlyphKind | 'distance'; className?: string }> = ({ kind, className }) => {
  if (kind === 'distance') return <RulerIcon className={className} />;

  const Icon = ICONS[kind];

  return <Icon className={className} />;
};
