export const MAX_FRAME_BYTES: number;
export const MAX_MANIFEST_BYTES: number;
export class FrameSetStore {
  constructor(options: { dir: string });
  list(): Promise<unknown[]>;
  read(id: string): Promise<{ manifest: string; createdAt: string } | null>;
  frame(id: string): Promise<string>;
  save(raw: string): Promise<{ ok: true }>;
  saveFrame(payload: { id: string; data: string }): Promise<{ ok: true }>;
}
