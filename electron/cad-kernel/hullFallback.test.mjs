import { afterAll, describe, expect, it } from 'vitest';
import { renderPart, stopKernels } from './client.mjs';
import { hullPolyhedron, innermostHull, isHullCrash } from './hullFallback.mjs';

afterAll(() => stopKernels());

const CRASHING_SHELL = `include <robotics.scad>
YF = -42; YR = 36; ZB = -28.5; ZT = 48; ZL = 8; ZUF = 28; ZUR = 16; RF = 33; RP = 28;
function fx(z, i) = let(r = RF - i, zt = ZT - RF, zb = ZB + RF) z > zt ? (60 - RF) + sqrt(max(0, r * r - (z - zt) * (z - zt))) : z < zb ? (60 - RF) + sqrt(max(0, r * r - (z - zb) * (z - zb))) : 60 - i;
function sq(t, n) = pow(max(0, 1 - pow(min(1, max(0, t)), n)), 1 / n);
function yr(z, i) = z >= ZUR ? (YR - i) * sq((z - ZUR) / (ZT - ZUR - i), 2.3) : z >= ZL ? YR - i : (YR - i) * sq((ZL - z) / (ZL - ZB - i), 2.0);
function yf(z, i) = z >= ZUF ? (-YF - i) * sq((z - ZUF) / (ZT - ZUF - i), 2.6) : z >= ZL ? -YF - i : (-YF - i) * sq((ZL - z) / (ZL - ZB - i), 2.0);
module slice(z, i) let(X = fx(z, i), a = yf(z, i), b = yr(z, i), d = max(a + b, 2), w = max(2 * X, 2), rr = max(0.5, min(RP - i, w / 2 - 0.3, d / 2 - 0.3)))
  translate([0, (b - a) / 2, z - 0.05]) linear_extrude(0.1) rect([w, d], rounding = rr, $fn = 48);
module soft(i) let(zm = (ZT + ZB) / 2, zh = (ZT - ZB) / 2 - i - 0.06) hull() for (u = [-87:6:87]) slice(zm + zh * sin(u), i);
$fn = 40;
soft(4.8);
echo("PORT", "top", [0, 0, 43], [0, 0, 1], "face", 1);
`;

describe('hull fallback', () => {
  it('finds the innermost hull and skips braces in strings', () => {
    const text = 'hull() { group() { hull() { text("}{"); cube(1); } } }';
    const block = innermostHull(text);

    expect(text.slice(block.start, block.end)).toBe('hull() { text("}{"); cube(1); }');
    expect(innermostHull('cube(1);')).toBeNull();
  });

  it('builds a closed polyhedron from points', async () => {
    const cube = [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1, 0.5, 0.5, 0.5];
    const scad = await hullPolyhedron(cube);

    expect(scad).toMatch(/^polyhedron\(points=\[/);
    expect(scad.match(/\],\[/g).length).toBeGreaterThan(10);
  });

  it('renders a part whose hull() crashes CGAL, keeping its ports', async () => {
    const res = await renderPart('openscad', CRASHING_SHELL, { timeoutMs: 60000 });

    expect(res.error ?? null).toBeNull();
    expect(res.stats.bbox.size).toEqual([110.4, 68.4, 66.79]);
    expect(res.audit.bodies).toBe(1);
    expect(res.ports.map((p) => p.name)).toEqual(['top']);
  }, 60000);

  it('recognises CGAL hull crashes', () => {
    expect(isHullCrash('ERROR: CGAL error in applyHull(): CGAL ERROR: assertion violation!')).toBe(true);
    expect(isHullCrash('Parser error in line 3')).toBe(false);
  });
});
