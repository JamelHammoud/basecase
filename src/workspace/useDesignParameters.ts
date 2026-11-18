import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { geometryWorker } from '../three/geometryWorker';
import { platformBridge } from '../utils/platformBridge';
import { prepareParameterEdit } from '../utils/designParameters/transaction';
import { editParameterBatch, type ParameterEdit } from '../utils/designParameters/edits';
import {
  parameterDesignStatus,
  rememberParameterDesign,
  parameterVerificationTargets,
} from '../utils/designParameters/verification';
import { rememberSupport } from '../utils/sketch/supportVerified';
import { surfaceOperands } from '../booleans/operands';
import { requestParameterDeletion } from './parameterDeletion';
import { errorMessage } from '../utils/errorMessage';
import type { SceneDocument } from './useSceneDocument';
import type { ShowToast } from './types';
import { measureParameterWork } from '../utils/designParameters/measurements';

interface Options {
  docs: SceneDocument;
  sceneId: string;
  showToast: ShowToast;
}

export function useDesignParameters({ docs, sceneId, showToast }: Options) {
  const job = useRef<AbortController | null>(null);
  const problem = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const parameters = docs.project.designParameters;
  const status = parameterDesignStatus(docs.parts, parameters);
  const prepare = async (edit?: ParameterEdit | ParameterEdit[], current: () => boolean = () => true) => {
    job.current?.abort();

    const controller = new AbortController();
    const source = docs.docRef.current;
    const declarations = docs.projectRef.current.designParameters;
    const isCurrent = () =>
      current() && docs.docRef.current === source && docs.projectRef.current.designParameters === declarations;

    job.current = controller;
    problem.current = null;

    try {
      const baseline = { parts: source.parts, parameters: declarations ?? [] };
      const edits = Array.isArray(edit) ? edit : [edit].filter((item) => item !== undefined);
      const design = editParameterBatch(baseline, edits);
      const result = await prepareParameterEdit(design, {
        force: parameterVerificationTargets(baseline, design, edits),
        compile: (part, code) => platformBridge.renderCad('openscad', code, part.cad?.expect),
        regenerate: (input) => {
          const started = performance.now();
          const pending = geometryWorker.call('parameterGeometry', input);

          measureParameterWork('dispatch', started);

          return pending;
        },
        isCurrent,
        signal: controller.signal,
      });

      if (!isCurrent() || controller.signal.aborted) return false;

      const committing = performance.now();

      rememberParameterDesign(result.parts, result.parameters);

      for (const part of surfaceOperands(result.parts)) rememberSupport(part.sketch);

      if (edit) docs.commitParameters(result.parts, result.parameters);
      else docs.writeDoc({ ...source, parts: result.parts });

      measureParameterWork('commit', committing);

      return true;
    } catch (error) {
      if (job.current === controller) problem.current = errorMessage(error);

      if (!controller.signal.aborted && isCurrent()) showToast(errorMessage(error), { tone: 'error' });

      return false;
    }
  };
  const run = async (edit: ParameterEdit | ParameterEdit[], current?: () => boolean) => {
    setBusy(true);

    const started = performance.now();
    const pending = prepare(edit, current);

    measureParameterWork('prepare', started);

    const controller = job.current;
    const result = await pending;

    if (job.current === controller) setBusy(false);

    return result;
  };
  const verify = useEffectEvent(() => {
    if (status.state === 'pending') void prepare();
  });

  useEffect(() => {
    verify();
  }, [docs.parts, parameters, sceneId]);
  useEffect(() => () => job.current?.abort(), [sceneId]);

  return {
    parameters: parameters ?? [],
    busy,
    expanded,
    setExpanded,
    status,
    apply: run,
    remove: (name: string) => requestParameterDeletion(name, { docs, apply: run, showToast }),
    cancel: () => job.current?.abort(),
    problem: () => problem.current,
  };
}

export type DesignParameters = ReturnType<typeof useDesignParameters>;
