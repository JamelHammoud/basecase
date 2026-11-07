import { createKernel } from '../kernelCore.mjs';

const post = self.postMessage.bind(self);
const encoder = new TextEncoder();
const waitingAssets = new Map();

delete self.Worker;

function asset(name) {
  if (!waitingAssets.has(name)) {
    waitingAssets.set(name, Promise.withResolvers());
    post({ asset: name });
  }

  return waitingAssets.get(name).promise;
}

const fromCompiledModule = (module) => (imports, done) => {
  WebAssembly.instantiate(module, imports).then((instance) => done(instance, module));

  return {};
};

async function loadReplicad() {
  const [compiled, { default: ocFactory }, replicad] = await Promise.all([
    asset('replicadWasm'),
    import('replicad-opencascadejs'),
    import('replicad'),
  ]);
  const oc = await ocFactory({ instantiateWasm: fromCompiledModule(compiled) });

  replicad.setOC(oc);

  return { replicad, oc };
}

async function loadManifold() {
  const [compiled, { default: manifoldFactory }] = await Promise.all([
    asset('manifoldWasm'),
    import('manifold-3d/manifold.js'),
  ]);

  return manifoldFactory({ instantiateWasm: fromCompiledModule(compiled) });
}

const kernel = createKernel({
  libraryFiles: () => asset('library'),
  scadFactory: async () => (await import('openscad-wasm')).createOpenSCAD,
  replicad: loadReplicad,
  manifold: loadManifold,
});

function prewarm(language) {
  kernel.prewarm('openscad');

  if (language === 'replicad') kernel.prewarm('replicad');
}

async function runJob(job) {
  const input = job.json === undefined ? job : { ...job, ...JSON.parse(job.json) };
  const bytes = encoder.encode(JSON.stringify(await kernel.run(input)));

  post({ id: job.id, bytes }, [bytes.buffer]);
}

function failJob(job, err) {
  const bytes = encoder.encode(JSON.stringify({ ok: false, error: String(err?.message ?? err).slice(0, 4000) }));

  post({ id: job.id, bytes }, [bytes.buffer]);
}

self.addEventListener('message', ({ data }) => {
  if (data.job) runJob(data.job).catch((err) => failJob(data.job, err));
  else if (data.prewarm) prewarm(data.prewarm);
  else if (data.asset) waitingAssets.get(data.asset)?.resolve(data.value);
});

post({ ready: true });
