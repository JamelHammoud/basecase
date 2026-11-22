import { sameProjectSnapshot } from '../utils/projectInputs';
import {
  currentCradleResult,
  FACE_DIRECTIONS,
  loadCradleFaces,
  makeAssemblyCradle,
  printAssemblyCradle,
} from './assemblyCradleActions';
import { useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { Viewport3DHandle } from '../three/viewport/types';
import { cradleSelections } from '../print/cradleSelection';
import type { CradleJob, PreparedCradle } from '../print/cradleJob';
import type { V3 } from '../guide/guideTypes';
import type { SceneDocument } from './useSceneDocument';
import type { BuildAlong } from './useBuildAlong';
import type { Printing } from './usePrinting';
import { useLatestRef } from '../utils/useLatestRef';
import { cradleView } from './cradleView';
import { cradleSourcesCurrent } from './cradleSources';
import type { DesignParameters } from './useDesignParameters';
import { useCradleLifetime } from './useCradleLifetime';

export interface CradleOptions {
  parameters: Pick<DesignParameters, 'status'>;
  active: boolean;
  scene: { sceneId: string };
  docs: SceneDocument;
  buildAlong: BuildAlong;
  printing: Printing;
  viewportRef: RefObject<Viewport3DHandle | null>;
  guide: { fingerprint: string };
}

export interface CradleResult {
  job: CradleJob;
  prepared: PreparedCradle;
}

export function useAssemblyCradle(options: CradleOptions) {
  const { docs, buildAlong } = options;
  const latest = useLatestRef(options);
  const controller = useRef<AbortController | null>(null);
  const faceRun = useRef(0);
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [selected, setSelected] = useState('');
  const [directions, setDirections] = useState(FACE_DIRECTIONS);
  const [origin, setOrigin] = useState<V3>([0, 0, 0]);
  const [down, setDown] = useState<V3 | null>(null);
  const [clearanceMm, setClearance] = useState(0.3);
  const [baseMm, setBase] = useState(3);
  const [depthMm, setDepth] = useState(6);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CradleResult | null>(null);
  const step = buildAlong.sourceStep;
  const [sheetStep, setSheetStep] = useState(step);
  const current = sourceSessionCurrent(options);
  const choices = step ? cradleSelections(docs.parts, docs.project.joints ?? [], step) : [];
  const valid = currentCradleResult(result, options, current);
  const prepared = valid ? valid.prepared : null;

  if (result && !valid) setResult(null);

  if (sheetStep !== step || (open && !current)) {
    setSheetStep(step);
    setOpen(false);
  }

  const firstId = choices[0]?.id ?? '';

  useCradleLifetime(options, controller, faceRun);

  const reset = () => {
    controller.current?.abort();
    faceRun.current++;
    setResult(null);
    setError(null);
    setBusy(false);
    setRemoving(false);
  };
  const close = () => {
    reset();
    setOpen(false);
  };
  const change = (action: () => void) => {
    reset();
    action();
  };
  const context = {
    options,
    latest,
    controller,
    faceRun,
    choices,
    selected,
    current,
    down,
    clearanceMm,
    baseMm,
    depthMm,
    valid,
    reset,
    setDirections,
    setOrigin,
    setBusy,
    setResult,
    setError,
    setOpen,
  };

  return {
    open: open && current,
    available: current && choices.length > 0,
    choices,
    selected,
    down,
    directions,
    removing,
    toggleRemoval: () => setRemoving((value) => !value),
    view: cradleView(buildAlong.view, prepared, removing, { origin, down: open ? down : null }),
    clearanceMm,
    baseMm,
    depthMm,
    busy,
    error,
    prepared,
    show: () => {
      reset();
      setSelected(firstId);
      setDown(null);
      setOpen(true);
      void loadCradleFaces(context, firstId);
    },
    close,
    make: () => makeAssemblyCradle(context),
    print: () => printAssemblyCradle(context),
    select: (id: string) =>
      change(() => {
        setSelected(id);
        setDown(null);
        void loadCradleFaces(context, id);
      }),
    face: (value: V3 | undefined) => change(() => setDown(value ?? null)),
    clearance: (value: number) => change(() => setClearance(value)),
    base: (value: number) => change(() => setBase(value)),
    depth: (value: number) => change(() => setDepth(value)),
  };
}

export type AssemblyCradle = ReturnType<typeof useAssemblyCradle>;

function sourceSessionCurrent({ active, docs, buildAlong, parameters }: CradleOptions): boolean {
  return (
    active &&
    buildAlong.active &&
    !!buildAlong.sourceStep &&
    buildAlong.sourceParts === docs.parts &&
    !!buildAlong.sourceProject &&
    sameProjectSnapshot(buildAlong.sourceProject, docs.project) &&
    cradleSourcesCurrent(docs.parts, parameters.status.state === 'current')
  );
}
