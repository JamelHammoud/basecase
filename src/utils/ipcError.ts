const IPC_PREFIX = /^Error invoking remote method '[^']+':\s*/;
const CLASS_NAMES = /^(?:\w*(?:Error|Exception):\s*)+/;

export const ipcErrorText = (e: unknown) =>
  (e instanceof Error ? e.message : String(e ?? '')).replace(IPC_PREFIX, '').replace(CLASS_NAMES, '').trim();
