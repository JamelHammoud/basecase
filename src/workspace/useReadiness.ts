import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { Viewport3DHandle } from '../components/Viewport3D';
import { loadSourced } from '../data/loadSourced';
import type { PrinterSetup } from '../data/printers';
import { readinessDelta, withDecisions } from '../readiness/readiness';
import type { Readiness } from '../readiness/types';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import { projectFingerprint, runReadiness } from './runReadiness';

const CHECK_AFTER_MS = 1500;

interface ReadinessOptions {
  parts: ScenePart[];
  project: ProjectSettings;
  printer: PrinterSetup;
  partsRef: { current: ScenePart[] };
  projectRef: { current: ProjectSettings };
  viewportRef: { current: Viewport3DHandle | null };
}

export interface ReadinessHandle {
  current: Readiness | null;
  checking: boolean;
  checkNow: () => Promise<Readiness | null>;
  latest: () => Readiness | null;
  deltaSince: (before: Readiness | null) => string;
  startTurn: () => void;
  turnStart: () => Readiness | null;
}

export function useReadiness({
  parts,
  project,
  printer,
  partsRef,
  projectRef,
  viewportRef,
}: ReadinessOptions): ReadinessHandle {
  'use memo';

  const [measured, setMeasured] = useState<Readiness | null>(null);
  const [checking, setChecking] = useState(false);
  const latestRef = useRef<Readiness | null>(null);
  const turnRef = useRef<Readiness | null>(null);
  const runRef = useRef<{ fingerprint: string; promise: Promise<Readiness | null> } | null>(null);
  const fingerprint = projectFingerprint(parts, project, printer.model.id);

  useEffect(() => {
    void loadSourced();
  }, []);

  const decided = (r: Readiness) => withDecisions(r, partsRef.current, projectRef.current.readiness);
  const latest = () => (latestRef.current ? decided(latestRef.current) : null);

  const checkNow = (): Promise<Readiness | null> => {
    const viewport = viewportRef.current;
    const now = projectFingerprint(partsRef.current, projectRef.current, printer.model.id);

    if (!viewport) return Promise.resolve(null);

    if (latestRef.current?.fingerprint === now) return Promise.resolve(latest());

    if (runRef.current?.fingerprint === now) return runRef.current.promise;

    setChecking(true);

    const promise = runReadiness({ viewport, parts: partsRef.current, project: projectRef.current, printer })
      .then((result) => {
        if (runRef.current?.promise !== promise && runRef.current) return decided(result);

        latestRef.current = result;
        setMeasured(result);

        return decided(result);
      })
      .catch(() => null)
      .finally(() => {
        if (runRef.current?.promise === promise) {
          runRef.current = null;
          setChecking(false);
        }
      });

    runRef.current = { fingerprint: now, promise };

    return promise;
  };

  const check = useEffectEvent(() => {
    void checkNow();
  });

  useEffect(() => {
    const timer = window.setTimeout(check, CHECK_AFTER_MS);

    return () => window.clearTimeout(timer);
  }, [fingerprint]);

  return {
    current: measured && withDecisions(measured, parts, project.readiness),
    checking,
    checkNow,
    latest,
    deltaSince: (before: Readiness | null) => {
      const now = latest();

      return now ? readinessDelta(before, now) : '';
    },
    startTurn: () => {
      turnRef.current = latest();
    },
    turnStart: () => turnRef.current,
  };
}
