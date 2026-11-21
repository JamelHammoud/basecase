import { useEffect, useRef, useState } from 'react';
import type { FitComparison, FitVariantRequest } from '../print/fitVariants';
import { fitBindings, fitVariantEdit } from '../print/fitVariants';
import type { ScenePart, ProjectSettings } from '../types/robotics';
import type { DesignParameters } from './useDesignParameters';
import type { RefObject } from 'react';
import type { ShowToast } from './types';
import { useLatestRef } from '../utils/useLatestRef';
import { errorMessage } from '../utils/errorMessage';
import { fitVariantCurrent, type FitVariantSource } from './fitVariantGuard';
import { fitVariantJob } from './fitVariantJob';

export interface FitVariantOptions {
  jobId: string;
  active: boolean;
  parts: ScenePart[];
  project: ProjectSettings;
  partsRef: RefObject<ScenePart[]>;
  projectRef: RefObject<ProjectSettings>;
  parameters: DesignParameters;
  showToast: ShowToast;
}

interface PreparedComparison extends FitComparison {
  parts: ScenePart[];
  project: ProjectSettings;
  scene: string;
}

export function useFitVariants(options: FitVariantOptions) {
  const latest = useLatestRef(options);
  const job = useRef<AbortController | null>(null);
  const [comparison, setComparison] = useState<PreparedComparison | null>(null);
  const [busy, setBusy] = useState(false);
  const source = () => ({
    parts: options.partsRef.current,
    parameters: options.projectRef.current.designParameters ?? [],
  });
  const bindings = fitBindings({ parts: options.parts, parameters: options.project.designParameters ?? [] });
  const current = (saved: FitVariantSource) => {
    const now = latest.current;

    return fitVariantCurrent(saved, {
      scene: now.jobId,
      active: now.active,
      parts: now.partsRef.current,
      project: now.projectRef.current,
    });
  };
  const cancel = () => {
    job.current?.abort();
    job.current = null;
    setBusy(false);
  };
  const reset = () => {
    cancel();
    setComparison(null);
  };

  const [scope, setScope] = useState({ jobId: options.jobId, active: options.active });

  if (scope.jobId !== options.jobId || scope.active !== options.active) {
    setScope({ jobId: options.jobId, active: options.active });
    setComparison(null);
    setBusy(false);
  }

  useEffect(() => () => job.current?.abort(), [options.jobId, options.active]);

  const prepare = async (request: FitVariantRequest) => {
    cancel();
    setBusy(true);

    const controller = new AbortController();
    const design = source();
    const captured = { source: design, project: options.project, scene: options.jobId };
    const isCurrent = () => !controller.signal.aborted && current(captured);

    job.current = controller;

    try {
      const result = await fitVariantJob({ design, request, controller, isCurrent });

      if (isCurrent()) setComparison({ ...result, project: options.project, scene: options.jobId });
    } catch (error) {
      const reason: unknown = controller.signal.aborted ? controller.signal.reason : error;

      if (!(reason instanceof DOMException && reason.name === 'AbortError'))
        options.showToast(errorMessage(reason), { tone: 'error' });
    } finally {
      if (job.current === controller) {
        job.current = null;
        setBusy(false);
      }
    }
  };
  const apply = async (index: number) => {
    try {
      if (!comparison || !current(comparison)) throw new Error('The design changed. Prepare the fit variants again.');

      const edit = fitVariantEdit(comparison, index, source());
      const applied = await options.parameters.apply(edit, () => current(comparison));

      if (applied) setComparison(null);

      return applied;
    } catch (error) {
      options.showToast(errorMessage(error), { tone: 'error' });

      return false;
    }
  };

  return { comparison, bindings, busy, prepare, apply, cancel, reset, stale: !!comparison && !current(comparison) };
}
