import { NO_KERNEL_ERROR } from './kernelRoutes.mjs';

const LANGUAGES = new Set(['openscad', 'replicad']);
const MAX_CODE_CHARS = 200_000;
const RENDER_MS = 90000;

const failure = (error) => Buffer.from(JSON.stringify({ ok: false, error }));

export function checkedRenderRequest(payload) {
  const { language, code } = payload ?? {};

  if (typeof language !== 'string' || !LANGUAGES.has(language)) return null;

  if (typeof code !== 'string' || code.length > MAX_CODE_CHARS) return null;

  return { language, code };
}

export async function renderCad(kernel, payload) {
  const job = checkedRenderRequest(payload);

  if (!job) return failure('The part code is too long or its language is unknown.');

  if (!kernel) return failure(NO_KERNEL_ERROR);

  try {
    const out = await kernel.render({ ...job, timeoutMs: RENDER_MS });

    return out instanceof Uint8Array ? out : Buffer.from(JSON.stringify(out));
  } catch (err) {
    return failure(String(err?.message ?? err));
  }
}
