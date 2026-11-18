import type { geometryHandlers } from '../three/geometryOps';
import { workerClient } from '../utils/workerRpc';
import { platformBridge } from '../utils/platformBridge';
import { sourcedMeshFiles } from '../three/componentMeshes';
import { surfaceOperands } from '../booleans/operands';
import { prepareFitVariants, type FitVariantRequest } from '../print/fitVariants';
import type { ParameterDesign } from '../utils/designParameters/mutations';

interface FitJob {
  design: ParameterDesign;
  request: FitVariantRequest;
  controller: AbortController;
  isCurrent: () => boolean;
}

export async function fitVariantJob({ design, request, controller, isCurrent }: FitJob) {
  const worker = workerClient<typeof geometryHandlers>(
    () => new Worker(new URL('../three/geometry.worker.ts', import.meta.url), { type: 'module' }),
    async () => {
      throw new Error('Couldn’t prepare fit variants. Restart Basecase.');
    },
  );
  const stop = () => worker.dispose();
  const deadline = setTimeout(
    () => controller.abort(new Error('Fit preparation reached 30 seconds. Prepare fewer values.')),
    30_000,
  );
  let provided = false;
  const meshFiles = async () => {
    if (provided) return undefined;

    const files = await sourcedMeshFiles(surfaceOperands(design.parts).filter((p) => p.componentId));

    provided = true;

    return files;
  };

  controller.signal.addEventListener('abort', stop, { once: true });

  try {
    const comparison = await prepareFitVariants(design, request, {
      sourceHash: (source) => worker.call('fitSourceHash', source),
      signal: controller.signal,
      isCurrent,
      compile: (part, code) => platformBridge.renderCad('openscad', code, part.cad?.expect),
      regenerate: async (job) => {
        const files = await meshFiles();

        if (controller.signal.aborted) throw new Error('Dimension edit cancelled.');

        return worker.call('parameterGeometry', { ...job, meshFiles: files });
      },
      cut: async (job) => {
        const files = await meshFiles();

        if (controller.signal.aborted) throw new Error('Dimension edit cancelled.');

        return worker.call('fitVariantCoupons', { ...job, meshFiles: files });
      },
    });

    return { ...comparison, parts: await worker.call('fitComparisonParts', comparison) };
  } finally {
    clearTimeout(deadline);
    controller.signal.removeEventListener('abort', stop);
    worker.dispose();
  }
}
