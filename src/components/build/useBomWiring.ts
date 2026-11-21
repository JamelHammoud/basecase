import { useEffect, useEffectEvent, useState, useSyncExternalStore, type RefObject } from 'react';
import type { Viewport3DHandle } from '../Viewport3D';
import type { WiringScene } from '../../wiring/netlist';
import type { ShowToast } from '../../workspace/types';
import { bomWiring, sameWiringScene, wiringForScene } from './bomWiring';

export function useBomWiring(scene: WiringScene, viewportRef: RefObject<Viewport3DHandle | null>, onToast: ShowToast) {
  const [source] = useState(bomWiring);
  const result = useSyncExternalStore(source.subscribe, source.snapshot);
  const { parts, project } = scene;
  const reportError = useEffectEvent(() => {
    if (result?.error && sameWiringScene(result.scene, { parts, project })) onToast(result.error, { tone: 'error' });
  });

  useEffect(
    () =>
      source.load({ parts, project }, async (input, signal) => {
        const viewport = viewportRef.current;

        if (!viewport) throw new Error('Open the scene to measure cable routes.');

        return viewport.wiring(input, signal);
      }),
    [source, parts, project, viewportRef],
  );
  useEffect(() => () => source.dispose(), [source]);
  useEffect(() => {
    reportError();
  }, [result]);

  return wiringForScene(result, scene);
}
