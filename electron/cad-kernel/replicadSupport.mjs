import { edgeHelpers } from './replicadEdges.mjs';

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

export function occMessage(oc, err) {
  if (err?.message && typeof err.message === 'string' && !/^\d+$/.test(err.message)) return err.message;

  const fromException = exceptionMessage(oc, err);

  if (fromException) return fromException;

  if (typeof err === 'number' || /^\d+$/.test(String(err?.message ?? ''))) {
    return failureData(oc, Number(err?.message ?? err)) ?? `OpenCascade error ${err}`;
  }

  return String(err?.message ?? err);
}

function exceptionMessage(oc, err) {
  const isWasmException = typeof WebAssembly.Exception === 'function' && err instanceof WebAssembly.Exception;

  if (!isWasmException || typeof oc?.getExceptionMessage !== 'function') return null;

  try {
    const [type, message] = oc.getExceptionMessage(err);

    return [type, message].filter(Boolean).join(': ') || null;
  } catch {
    return null;
  }
}

function failureData(oc, pointer) {
  try {
    const failure = oc?.OCJS?.getStandard_FailureData(pointer);
    const message = failure?.GetMessageString?.();

    return message ? `OpenCascade: ${message}` : null;
  } catch {
    return null;
  }
}

let notes = [];

export function replicadScope(replicad) {
  notes = [];

  const scope = {};

  for (const name of Object.keys(replicad)) {
    if (IDENTIFIER.test(name) && name !== 'default') scope[name] = replicad[name];
  }

  return { ...scope, ...edgeHelpers((line) => notes.push(line)) };
}

export function unwrapResult(result) {
  const out = { shape: result, ports: [], notes };
  const isWrapper = result && typeof result === 'object' && !Array.isArray(result) && 'shape' in result;

  if (isWrapper) {
    out.shape = result.shape;
    out.ports = result.ports ?? [];
  }

  if (Array.isArray(out.shape)) out.shape = out.shape.filter(Boolean).reduce((a, b) => a.fuse(b));

  return out;
}

export const wrapCode = (code) => `"use strict";\nreturn (() => {\n${code}\n})();`;
