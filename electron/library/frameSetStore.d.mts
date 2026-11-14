export const MAX_FRAME_MANIFEST_BYTES: number;
export const MAX_FRAME_BLOB_BYTES: number;
export class FrameSetStore {
  constructor(options: { dir: string });
  saveFrame(payload: unknown): { ok: true };
  saveManifest(value: unknown): { ok: true };
  finalize(value: unknown): { ok: true };
  manifest(id: string): Record<string, unknown> | null;
  list(): Array<Record<string, unknown>>;
  frame(payload: unknown): { jpeg: Uint8Array; depth: Uint8Array } | null;
  jpeg(payload: unknown): Uint8Array | null;
}
