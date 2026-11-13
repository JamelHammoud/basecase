import React from 'react';
import { MenuItem } from '../design-system';
import { PLANE_VIEWS, planeLabel, type PlaneView } from '../mirror/plane';

interface MirrorPlaneItemsProps {
  current: PlaneView;
  onPick: (view: PlaneView) => void;
}

export const MirrorPlaneItems: React.FC<MirrorPlaneItemsProps> = ({ current, onPick }) => (
  <>
    {PLANE_VIEWS.map((view) => (
      <MenuItem key={view} label={planeLabel(view)} checked={current === view} onSelect={() => onPick(view)} />
    ))}
  </>
);
