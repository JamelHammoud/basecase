import { useEffect, useState, type ReactNode } from 'react';
import { closeOperatorCamera, operatorCameraSnapshot } from './operator/operatorCamera';
import { createVisionScope, ResetVisionScopeContext, VisionScopeContext } from './visionScope';

export function VisionScopeProvider({ scene, children }: { scene: string; children: ReactNode }) {
  const [scope, setScope] = useState(() => createVisionScope(scene));

  useEffect(
    () => () => {
      scope.playback.closeRecordedCameras();

      if (operatorCameraSnapshot(scope.operator.source).open) closeOperatorCamera();
    },
    [scope],
  );

  const reset = () => setScope(createVisionScope(scene));

  return (
    <ResetVisionScopeContext value={reset}>
      <VisionScopeContext value={scope}>{children}</VisionScopeContext>
    </ResetVisionScopeContext>
  );
}
