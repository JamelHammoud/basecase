import type { ClipFiles } from './clip';

export const CLIP_DIR = 'models/mobileclip-s0';

export const CLIP_FILES = { vision: 'vision.onnx', text: ['text.onnx.1', 'text.onnx.2'], merges: 'merges.txt' };

const clipUrl = (file: string) => new URL(`${import.meta.env.BASE_URL}${CLIP_DIR}/${file}`, self.location.origin).href;

async function fetched(file: string): Promise<Response> {
  const response = await fetch(clipUrl(file));

  if (!response.ok) throw new Error(`The frame search model didn’t load (${response.status}).`);

  return response;
}

const bytesOf = async (file: string) => new Uint8Array(await (await fetched(file)).arrayBuffer());

export function joinBytes(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.byteLength, 0));
  let at = 0;

  for (const part of parts) {
    out.set(part, at);
    at += part.byteLength;
  }

  return out;
}

export async function loadClipFiles(): Promise<ClipFiles> {
  const [vision, text, merges] = await Promise.all([
    bytesOf(CLIP_FILES.vision),
    Promise.all(CLIP_FILES.text.map(bytesOf)).then(joinBytes),
    fetched(CLIP_FILES.merges).then((r) => r.text()),
  ]);

  return { vision, text, merges };
}
