export const hm = (h: number) =>
  h < 1
    ? `${Math.max(1, Math.round(h * 60))} min`
    : `${Math.floor(h)} h ${String(Math.round((h % 1) * 60)).padStart(2, '0')} min`;

export const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');

  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
