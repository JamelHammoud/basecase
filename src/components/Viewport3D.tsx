import React, { useEffect, useEffectEvent, useImperativeHandle, useRef, useState } from 'react';
import { CURSORS } from '../design-system/cursors';
import { useComponentMeshVersion } from '../three/componentMeshes';
import { ViewportEngine } from '../three/viewport/engine';
import type { Viewport3DHandle, ViewportProps } from '../three/viewport/types';

export type { Viewport3DHandle } from '../three/viewport/types';

const DETACHED: Viewport3DHandle = {
  captureScreenshot: () => '',
  setCameraPreset: () => {},
  focusSelected: () => {},
  zoomBy: () => {},
  pickAt: () => null,
  captureViews: () => [],
  interference: () => ({ interferences: [], coplanar: [] }),
  measureParts: () => ({}),
  partTriangles: () => null,
  servoOutput: () => null,
  sweepClashes: () => [],
  frameAll: () => {},
  animateSpawn: () => {},
  setPose: () => {},
  restBounds: () => null,
  posedInterference: () => [],
  posedFloor: () => null,
  projectPoints: (points) => points.map(() => ({ x: 0, y: 0, visible: false })),
};

const canvasCursor = (props: ViewportProps) => {
  if (props.annotateMode) {
    return CURSORS.comment;
  }

  return props.transformMode === 'sculpt' ? CURSORS.crosshair : CURSORS.arrow;
};

export const Viewport3D = React.forwardRef<Viewport3DHandle, ViewportProps>(function Viewport3D(props, ref) {
  const meshVersion = useComponentMeshVersion();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const marqueeRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<ViewportEngine | null>(null);
  const [spacePressed, setSpacePressed] = useState(false);
  const [snapBypassed, setSnapBypassed] = useState(false);
  const currentInput = useEffectEvent(() => ({ props, meshVersion }));

  useEffect(() => {
    const container = mountRef.current;

    if (!container) {
      return;
    }

    const engine = new ViewportEngine({
      container,
      marquee: () => marqueeRef.current,
      ui: { setSnapBypassed, setSpacePressed },
      ...currentInput(),
    });

    engineRef.current = engine;

    return () => {
      engineRef.current = null;
      engine.dispose();
    };
  }, []);

  useEffect(() => {
    engineRef.current?.update(props, meshVersion);
  });

  useImperativeHandle(
    ref,
    () =>
      new Proxy(DETACHED, {
        get: (_, key: keyof Viewport3DHandle) => (engineRef.current?.api ?? DETACHED)[key],
      }),
    [],
  );

  return (
    <div className="relative w-full h-full select-none overflow-hidden bg-[#1b1b1b]">
      <div
        ref={mountRef}
        className={`canvas-cursor relative overflow-hidden w-full h-full ${spacePressed ? 'cursor-grab active:cursor-grabbing' : ''}`}
        style={{ cursor: spacePressed ? undefined : canvasCursor(props) }}
      />
      {snapBypassed && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 glass-menu rounded-full h-8 px-3.5 flex items-center text-[12.5px] text-white/85 pointer-events-none animate-fade-in">
          Snapping off
        </div>
      )}
      <div
        ref={marqueeRef}
        aria-hidden
        className="absolute left-0 top-0 rounded-[3px] border border-[#0d99ff] bg-[#0d99ff]/[0.12] pointer-events-none"
        style={{ display: 'none' }}
      />
    </div>
  );
});
