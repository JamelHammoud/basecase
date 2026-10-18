import { useState } from 'react';
import type { TransformMode } from '../types/robotics';
import type { Annotations } from './useAnnotations';
import type { ToolMode } from './useToolMode';

interface PanelSyncOptions {
  tool: ToolMode;
  annotations: Pick<Annotations, 'setCommentMode'>;
  isRightOpen: boolean;
  sculptEnabled: boolean;
  onRobot: boolean;
  hasRig: boolean;
}

const modeForPosing = (mode: TransformMode, posing: boolean): TransformMode => {
  if (posing) return 'pose';

  return mode === 'pose' ? 'translate' : mode;
};

export function usePanelSync({ tool, annotations, isRightOpen, sculptEnabled, onRobot, hasRig }: PanelSyncOptions) {
  const posingActive = tool.rightTab === 'pose' && isRightOpen;
  const [wasPosing, setWasPosing] = useState(posingActive);

  const posingChanged = wasPosing !== posingActive;

  if (posingChanged) {
    setWasPosing(posingActive);
    tool.setTransformMode((m) => modeForPosing(m, posingActive));
  }

  if (posingChanged && posingActive) annotations.setCommentMode(false);

  if (!sculptEnabled && tool.transformMode === 'sculpt') tool.setMode('translate');

  const tabGone = (!onRobot && tool.rightTab === 'pose') || (!hasRig && tool.rightTab === 'sim');

  if (tabGone) tool.setRightTab('inspector');
}
