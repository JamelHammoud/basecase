import { safeAudit } from './audit.mjs';
import { measure } from './kernelMesh.mjs';
import { createOpenscadEngine } from './openscadEngine.mjs';
import { createReplicadEngine } from './replicadEngine.mjs';

const EMPTY_PART =
  'The part is empty: a boolean removed everything. Check that the cutters are smaller than the body and that intersected shapes overlap.';

function auditJob({ mesh }) {
  const stats = measure(mesh.positions, mesh.indices);

  return { ok: true, stats, audit: safeAudit({ ...mesh, stats }) };
}

export function createKernel(deps) {
  const engines = { openscad: createOpenscadEngine(deps), replicad: createReplicadEngine(deps) };
  let chain = Promise.resolve();

  async function renderJob({ language, code, expect }) {
    const started = Date.now();
    const engine = language === 'replicad' ? engines.replicad : engines.openscad;

    try {
      const result = await engine.render(code);

      if (!result.indices.length) throw new Error(EMPTY_PART);

      return { ok: true, ...result, audit: safeAudit({ ...result, expect }), ms: Date.now() - started };
    } catch (err) {
      return { ok: false, error: String(err?.message ?? err).slice(0, 4000), ms: Date.now() - started };
    } finally {
      if (language !== 'replicad') engines.openscad.prewarm();
    }
  }

  async function stepJob({ step }) {
    try {
      return await engines.replicad.exportStep(step);
    } catch (err) {
      return { ok: false, error: String(err?.message ?? err).slice(0, 4000) };
    }
  }

  const runJob = (job) => {
    if (job?.step) return stepJob(job);

    return job?.mesh ? auditJob(job) : renderJob(job ?? {});
  };

  return {
    run(job) {
      const result = chain.then(() => runJob(job));

      chain = result.catch(() => {});

      return result;
    },
    prewarm(language = 'openscad') {
      engines[language === 'replicad' ? 'replicad' : 'openscad'].prewarm();
    },
  };
}
