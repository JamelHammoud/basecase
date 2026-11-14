export function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');

  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
