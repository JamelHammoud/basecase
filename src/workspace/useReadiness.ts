import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { knownPurchases, usePurchases } from '../components/build/usePurchases';
import type { Viewport3DHandle } from '../components/Viewport3D';
import { loadSourced } from '../data/loadSourced';
import type { PrinterSetup } from '../data/printers';
import { failedReadiness, readinessDelta, withDecisions } from '../readiness/readiness';
import type { Readiness } from '../readiness/types';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import type { CheckDot } from '../utils/engineeringTypes';
import { currentMoney } from '../utils/currencyStore';
import { useMoney } from '../utils/useMoney';
import { newestRuns } from './newestRuns';
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
  fingerprint: string;
  checking: boolean;
  checkNow: () => Promise<Readiness | null>;
  latest: () => Readiness | null;
  deltaSince: (before: Readiness | null) => string;
  startTurn: () => void;
  turnStart: () => Readiness | null;
  dots: CheckDot[] | null;
  showDots: (check: string | null) => void;
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
  const [dotsCheck, setDotsCheck] = useState<string | null>(null);
  const latestRef = useRef<Readiness | null>(null);
  const turnRef = useRef<Readiness | null>(null);
  const runRef = useRef<{ fingerprint: string; promise: Promise<Readiness | null> } | null>(null);
  const [runs] = useState(newestRuns);
  const money = useMoney();
  const [purchases] = usePurchases();
  const fingerprint = projectFingerprint(parts, project, printer.model.id, { purchases, money });

  useEffect(() => {
    void loadSourced();
  }, []);

  const decided = (r: Readiness) => withDecisions(r, partsRef.current, projectRef.current.readiness);
  const latest = () => (latestRef.current ? decided(latestRef.current) : null);

  const checkNow = (): Promise<Readiness | null> => {
    const viewport = viewportRef.current;
    const now = projectFingerprint(partsRef.current, projectRef.current, printer.model.id, {
      purchases: knownPurchases(),
      money: currentMoney(),
    });

    if (!viewport) return Promise.resolve(null);

    if (latestRef.current?.fingerprint === now) return Promise.resolve(latest());

    if (runRef.current?.fingerprint === now) return runRef.current.promise;

    setChecking(true);

    const run = runs.begin();
    const keepIfNewest = (result: Readiness) => {
      if (run.isNewest()) {
        latestRef.current = result;
        setMeasured(result);
      }

      return decided(result);
    };
    const promise = runReadiness({
      viewport,
      parts: partsRef.current,
      project: projectRef.current,
      printer,
      fingerprint: now,
    })
      .then(keepIfNewest)
      .catch((error: unknown) =>
        keepIfNewest(failedReadiness(error, { parts: partsRef.current, decisions: projectRef.current.readiness })),
      )
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
    fingerprint,
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
    dots: (dotsCheck && measured?.rows.find((r) => r.check === dotsCheck)?.dots) || null,
    showDots: setDotsCheck,
  };
}
