import { readGltfDocument } from './worldImport/gltfAccessors';

export function offlineEvaluationMesh(bytes: Uint8Array): boolean {
  try {
    const { document } = readGltfDocument(bytes);
    const pending: unknown[] = [document];
    let nodes = 0;

    while (pending.length) {
      const value = pending.pop();

      nodes++;

      if (nodes > 250_000) return false;

      if (!value || typeof value !== 'object') continue;

      const entries = Object.entries(value);

      if (
        entries.some(
          ([key, uri]) =>
            key === 'uri' &&
            (typeof uri !== 'string' ||
              !/^data:(?:application\/(?:octet-stream|gltf-buffer)|image\/(?:png|jpeg|webp));base64,[A-Za-z0-9+/=]+$/.test(
                uri,
              )),
        )
      )
        return false;

      pending.push(...entries.map(([, item]) => item));
    }

    return true;
  } catch {
    return false;
  }
}
