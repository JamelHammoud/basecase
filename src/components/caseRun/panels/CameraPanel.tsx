import React from 'react';
import { CameraTile } from '../../cameras/CameraTile';
import type { PanelViewProps } from '../panelContext';
import { Titled } from './PanelTitle';

export const CameraPanel: React.FC<PanelViewProps<'camera'>> = ({ panel, ctx }) => {
  const cameras = ctx.studio?.cameras;

  if (!cameras) return null;

  const key = panel.signal.slice('camera.'.length);
  const views = cameras.views.filter((v) => key === '*' || v.key === key);

  return (
    <Titled title={panel.title}>
      <div className="flex flex-col gap-2">
        {views.map((view) => (
          <CameraTile key={view.key} {...cameras.tile(view)} fill />
        ))}
      </div>
    </Titled>
  );
};
