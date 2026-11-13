import { fromCompiledModule } from '../cad-kernel/sandbox/wasm.mjs';
import { convertBodies } from './bodiesCore.mjs';
import { convertCad } from './convertCore.mjs';
import { encodeReply, errorReply } from './reply.mjs';

const post = self.postMessage.bind(self);
const occtWasm = Promise.withResolvers();

delete self.Worker;

async function loadOcct() {
  post({ asset: 'occtWasm' });

  const [compiled, { default: occtFactory }] = await Promise.all([occtWasm.promise, import('occt-import-js')]);

  return occtFactory({ instantiateWasm: fromCompiledModule(compiled) });
}

async function reply(job) {
  if (job.probe) return (await import('./probes.mjs')).runProbe(job.probe);

  const occt = await loadOcct();

  if (job.bodies) {
    const { header, bin } = convertBodies(occt, job);

    return encodeReply(header, bin);
  }

  const { glb, result } = convertCad(occt, job);

  return encodeReply({ ok: true, ...result }, glb);
}

function send(id, bytes) {
  post({ id, bytes }, [bytes.buffer]);
}

self.addEventListener('message', ({ data }) => {
  if (data?.job) {
    reply(data.job).then(
      (bytes) => send(data.job.id, bytes),
      (err) => send(data.job.id, errorReply(err?.message ?? err)),
    );
  } else if (data?.asset === 'occtWasm') occtWasm.resolve(data.value);
});

post({ ready: true });
