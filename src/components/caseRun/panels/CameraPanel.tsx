import React from 'react';
import { OPERATOR_KEY, useOperatorCamera } from '../../../cameras/operator/operatorCamera';
import { CameraTile } from '../../cameras/CameraTile';
import { OperatorTile } from '../../cameras/OperatorTile';
import type { PanelViewProps } from '../panelContext';
import { Titled } from './PanelTitle';

export const CameraPanel: React.FC<PanelViewProps<'camera'>> = ({ panel, ctx }) => {
  const cameras = ctx.studio?.cameras;
  const operator = useOperatorCamera();

  if (!cameras) return null;

  const key = panel.signal.slice('camera.'.length);
  const views = cameras.views.filter((v) => key === '*' || v.key === key);
  const stream = key === OPERATOR_KEY ? operator.stream : null;

  return (
    <Titled title={panel.title}>
      <div className="flex flex-col gap-2">
        {stream && <OperatorTile stream={stream} label={operator.label} large={false} fill />}
        {views.map((view) => (
          <CameraTile key={view.key} {...cameras.tile(view)} fill />
        ))}
      </div>
    </Titled>
  );
};
