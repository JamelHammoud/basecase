import React from 'react';
import { CameraTile } from '../../cameras/CameraTile';
import { OperatorTile } from '../../cameras/OperatorTile';
import type { PanelViewProps } from '../panelContext';
import { Titled } from './PanelTitle';

export const CameraPanel: React.FC<PanelViewProps<'camera'>> = ({ panel, ctx }) => {
  const key = panel.signal.slice('camera.'.length);
  const views = ctx.cameras.views.filter((v) => key === '*' || v.key === key);

  return (
    <Titled title={panel.title}>
      <div className="flex flex-col gap-2">
        {key === 'operator' && <OperatorTile fill />}
        {views.map((view) => (
          <CameraTile key={view.key} {...ctx.cameras.tile(view)} fill />
        ))}
      </div>
    </Titled>
  );
};
