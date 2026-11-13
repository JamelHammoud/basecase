import React, { useEffect, useEffectEvent, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { CURSORS } from '../design-system/cursors';
import { useComponentMeshVersion } from '../three/componentMeshes';
import { useSimReadyVisualVersion } from '../three/simreadyVisuals';
import { ViewportEngine } from '../three/viewport/engine';
import type { Viewport3DHandle, ViewportProps } from '../three/viewport/types';

export type { Viewport3DHandle } from '../three/viewport/types';

const DETACHED: Viewport3DHandle = {
  captureScreenshot: () => '',
  currentView: () => ({ position: [0, 0, 0], target: [0, 0, -1], hfovDeg: 60 }),
  lookThrough: () => {},
  setCameraPreset: () => {},
  focusSelected: () => {},
  zoomBy: () => {},
  pickAt: () => null,
  captureViews: async () => [],
  interference: async () => ({ interferences: [], coplanar: [] }),
  fastenerChains: async () => ({ screws: [], sleeves: [] }),
  assembly: async () => ({
    chains: { screws: [], sleeves: [] },
    fits: { insertWalls: {}, leadRoomMm: {} },
    moves: {},
    drivers: {},
    splits: {},
    timedOut: false,
    ms: 0,
  }),
  measureParts: async () => ({}),
  visibleShares: async () => ({}),
  printShapes: async () => ({}),
  printMeshes: async () => ({}),
  printThreeMf: async () => ({}),
  exportUsdz: async () => new Uint8Array(),
  partTriangles: () => null,
  servoOutput: () => null,
  jointAxis: async () => null,
  meshesReady: async () => [],
  sweepClashes: async () => [],
  frameAll: () => {},
  animateSpawn: () => {},
  setPose: () => {},
  setScan: () => {},
  scanPointCount: () => 0,
  setGhost: () => {},
  ghostState: () => null,
  followPart: () => {},
  restBounds: () => null,
  silhouetteShots: () => [],
  posedInterference: async () => [],
  posedFloor: async () => null,
  meshGaps: async () => [],
  projectPoints: (points) => points.map(() => ({ x: 0, y: 0, visible: false })),
  measureFrom: () => {},
  cancelMeasure: () => false,
  checkDotCount: () => 0,
};

const canvasCursor = (props: ViewportProps) => {
  if (props.axisPick) {
    return props.axisPick.ready ? CURSORS.crosshair : 'not-allowed';
  }

  if (props.annotateMode) {
    return CURSORS.comment;
  }

  if (props.markMode && props.markTool === 'eraser') {
    return CURSORS.eraser;
  }

  return props.measureMode || props.markMode || props.transformMode === 'sculpt' ? CURSORS.crosshair : CURSORS.arrow;
};

type Viewport3DProps = ViewportProps & { markField?: React.ReactNode };

export const Viewport3D = React.forwardRef<Viewport3DHandle, Viewport3DProps>(function Viewport3D(
  { markField, ...props },
  ref,
) {
  const meshVersion = useComponentMeshVersion() + useSimReadyVisualVersion();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const marqueeRef = useRef<HTMLDivElement | null>(null);
  const measureLabelRef = useRef<HTMLDivElement | null>(null);
  const markFieldRef = useRef<HTMLDivElement | null>(null);
  const ghostLabelRef = useRef<HTMLDivElement | null>(null);
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
      measureLabel: () => measureLabelRef.current,
      markField: () => markFieldRef.current,
      ghostLabel: () => ghostLabelRef.current,
      ui: { setSnapBypassed, setSpacePressed },
      ...currentInput(),
    });

    engineRef.current = engine;

    return () => {
      engineRef.current = null;
      engine.dispose();
    };
  }, []);

  useLayoutEffect(() => {
    engineRef.current?.update(props, meshVersion);
  });

  useImperativeHandle(
    ref,
    () =>
      new Proxy(DETACHED, {
        get: (_, key: keyof Viewport3DHandle) => engineRef.current?.api[key] ?? DETACHED[key],
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
        ref={measureLabelRef}
        aria-live="polite"
        className="absolute left-0 top-0 glass rounded-full h-8 px-3.5 items-center whitespace-pre text-[13px] tabular-nums pointer-events-none"
        style={{ display: 'none' }}
      />
      <div
        ref={ghostLabelRef}
        data-testid="ghost-gap"
        className="absolute left-0 top-0 glass rounded-full h-8 px-3.5 items-center text-[13px] tabular-nums text-[#0d99ff] pointer-events-none"
        style={{ display: 'none' }}
      />
      <div ref={markFieldRef} className="absolute left-0 top-0">
        {markField}
      </div>
      <div
        ref={marqueeRef}
        aria-hidden
        className="absolute left-0 top-0 rounded-[3px] border border-[#0d99ff] bg-[#0d99ff]/[0.12] pointer-events-none"
        style={{ display: 'none' }}
      />
    </div>
  );
});
