import { exposesTestHooks } from './platform/testHooks';

let last: { name: string; bytes: Uint8Array } | null = null;

export const lastDownload = () => last;

export function downloadBytes(bytes: Uint8Array, name: string, type: string) {
  if (exposesTestHooks()) last = { name, bytes };

  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = document.createElement('a');

  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
