import { store } from './store.mjs';

const readiness = store('diagnostic-readiness', {});

export const windowsDiagnosticsReady = () => readiness.get('windows').version === 1;

export function rememberDiagnostic(result) {
  if (!result.verified || result.selection.platform !== 'windows') return;

  readiness.save('windows', {
    version: 1,
    revision: result.selection.revision,
    url: result.url,
    runId: result.runId,
    verifiedAt: Date.now(),
  });
}
