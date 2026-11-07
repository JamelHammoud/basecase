export const f = (n: number) => {
  const r = Math.round(n * 1e6) / 1e6;

  return Object.is(r, -0) ? '0' : String(r);
};
export const vec = (v: number[]) => v.map(f).join(' ');
export const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
export const safeId = (id: string) => id.replace(/\W/g, '_').slice(0, 40);
