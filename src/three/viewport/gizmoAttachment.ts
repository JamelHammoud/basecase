import type { Object3D } from 'three';
import type { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

export function watchGizmoAttachment(controls: TransformControls) {
  let attached: Object3D | undefined;
  const detach = () => controls.detach();
  const sync = () => {
    attached?.removeEventListener('removed', detach);
    attached = controls.object;
    attached?.addEventListener('removed', detach);
  };

  controls.addEventListener('object-changed', sync);
  sync();

  return () => {
    controls.removeEventListener('object-changed', sync);
    attached?.removeEventListener('removed', detach);
  };
}
