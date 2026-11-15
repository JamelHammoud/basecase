import { useRef, useState } from 'react';
import { applyLighten, type LightenOptions } from './lighten';
import type { WorkspaceCore } from './useWorkspaceCore';

export function useLighten({ docs, viewportRef, showToast }: WorkspaceCore) {
  'use memo';

  const [partId, setPartId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const request = useRef(0);
  const context = {
    parts: () => docs.partsRef.current,
    project: () => docs.projectRef.current,
    viewport: () => viewportRef.current,
    commitParts: docs.commitParts,
  };
  const close = () => {
    request.current += 1;
    setPartId(null);
    setBusy(false);
    setProblem(null);
  };
  const apply = (id: string, options: LightenOptions = {}) => applyLighten(context, { id, ...options });
  const run = async (options: LightenOptions) => {
    if (!partId || busy) return;

    const started = ++request.current;

    setBusy(true);
    setProblem(null);

    const outcome = await applyLighten(
      { ...context, current: () => started === request.current },
      { id: partId, ...options },
    );

    if (started !== request.current) return;

    setBusy(false);

    if (!('result' in outcome)) {
      setProblem(outcome.text);

      return;
    }

    showToast(outcome.text);
    close();
  };

  return {
    partId,
    busy,
    problem,
    apply,
    close,
    open: (id: string) => {
      request.current += 1;
      setPartId(id);
      setBusy(false);
      setProblem(null);
    },
    run: (options: LightenOptions) => void run(options),
  };
}
