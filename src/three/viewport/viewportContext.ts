import type { PartLayer } from './partLayer';
import type { RenderLoop } from './renderLoop';
import type { Stage } from './stage';
import type { ViewportProps } from './types';

export interface ViewportUi {
  setSnapBypassed: (bypassed: boolean) => void;
  setSpacePressed: (pressed: boolean) => void;
}

export interface ViewportRuntime {
  shiftHeld: boolean;
  draggingGizmo: boolean;
}

export interface ViewportContext {
  stage: Stage;
  layer: PartLayer;
  loop: RenderLoop;
  ui: ViewportUi;
  runtime: ViewportRuntime;
  props: () => ViewportProps;
  applyPose: () => void;
}
