import React from 'react';
import { attachOperatorCanvas } from '../../cameras/operator/cameraInput';
import { useOperatorCamera } from '../../cameras/operator/operatorStore';
import { tileLabel, tileShell } from './CameraTile';

export const OperatorTile: React.FC<{ fill?: boolean }> = ({ fill }) => {
  const { on, label } = useOperatorCamera();

  if (!on) return null;

  return (
    <div data-testid="camera-tile" data-camera="operator" className={tileShell(fill, false)}>
      <canvas ref={attachOperatorCanvas} width={640} height={480} className="absolute inset-0 w-full h-full block" />
      {label && <span className={tileLabel}>{label}</span>}
    </div>
  );
};
