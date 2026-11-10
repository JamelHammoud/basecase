export function downloadBytes(bytes: Uint8Array, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = document.createElement('a');

  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
