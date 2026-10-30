import { afterAll, describe, expect, it } from 'vitest';
import { auditText } from '../cad-mcp/partAudit.mjs';
import { renderPart, stopKernels } from './client.mjs';

const PLATE =
  'include <robotics.scad>\n' +
  'diff() cuboid([40,30,6], rounding=4, edges="Z") { tag("remove") grid_copies(spacing=[30,20], n=[2,2]) cyl(d=3.4, h=8); tag("remove") cyl(d=8, h=8); }\n' +
  'echo("PORT", "centre", [0,0,3], [0,0,1], "bore", 8);\n' +
  'echo("PORT", "misplaced", [5,5,0], [0,0,1], "bore", 3);';

afterAll(() => stopKernels());

describe('kernel audit', () => {
  it('flags solids that touch only along an edge, and loose bodies', async () => {
    const touching = await renderPart('openscad', 'cube(10); translate([10,10,0]) cube(10);');
    const loose = await renderPart('openscad', 'cube(10); translate([20,0,0]) cube(10);');

    expect(touching.audit).toMatchObject({ nonManifoldEdges: 1, bodies: 1, genus: null });
    expect(touching.audit.spots[0].at).toEqual([10, 10, 5]);
    expect(loose.audit).toMatchObject({ nonManifoldEdges: 0, bodies: 2, genus: 0 });

    const text = auditText({ audit: loose.audit, stats: loose.stats });

    expect(text).toContain('2 separate bodies');
  }, 60000);

  it('measures requirements and checks ports against the mesh', async () => {
    const res = await renderPart('openscad', PLATE, {
      expect: {
        holes: [
          { count: 4, d: 3.4, axis: 'z' },
          { count: 2, d: 8, axis: 'z' },
        ],
        min_wall_mm: 1.2,
        flat_base: true,
        symmetric: ['x', 'y'],
        genus: 5,
      },
    });
    const checks = Object.fromEntries(res.audit.checks.map((c) => [`${c.name} ${c.want}`, c.pass]));

    expect(checks).toEqual({
      'holes 4 through holes Ø3.4 along z': true,
      'holes 2 through holes Ø8 along z': false,
      'min wall 1.2 mm': true,
      'flat base a flat face on z = -3 covering 25% of the footprint': true,
      'symmetric in x mirror image across x = 0': true,
      'symmetric in y mirror image across y = 0': true,
      'genus 5': true,
    });
    expect(res.audit.ports.map((p) => [p.name, p.check])).toEqual([
      ['centre', 'ok'],
      ['misplaced', 'failed'],
    ]);
    expect(res.audit.craft).toMatchObject({ dominantRadius: 4 });
  }, 60000);

  it('counts a sealed hollow as one body with a void', async () => {
    const res = await renderPart('openscad', 'difference() { cube(20, center = true); cube(16, center = true); }');

    expect(res.audit.bodies).toBe(1);
    expect(res.audit.voids).toBe(1);
  });

  it('rejects an empty part and decodes OpenCascade errors', async () => {
    const empty = await renderPart(
      'replicad',
      'return makeBox([0,0,0],[10,10,10]).cut(makeBox([-1,-1,-1],[11,11,11]));',
    );
    const failed = await renderPart('replicad', 'return makeBox([0,0,0],[10,10,10]).fillet(20);');

    expect(empty.error).toMatch(/The part is empty/);
    expect(failed.error).toMatch(/^StdFail_NotDone/);
  }, 60000);

  it('blends the edges a boolean created and reports what it hit', async () => {
    const res = await renderPart(
      'replicad',
      'let body = makeBox([-20,-15,0],[20,15,10]);\n' +
        'const before = edgeKeys(body);\n' +
        'body = body.cut(makeCylinder(4, 30, [0,0,-5]));\n' +
        'body = filletEdges(body, 1, newEdges(before, body), "bore");\n' +
        'body = filletEdges(body, 3, convexEdges(body, { outer: true }), "outer");\n' +
        'return { shape: body, ports: [{ name: "bore", position: [0,0,10], axis: [0,0,1], kind: "bore", diameter: 8 }] };',
    );

    expect(res.warnings).toEqual([
      'fillet "bore" 1 mm hit 2 of 2 intended edges.',
      'fillet "outer" 3 mm hit 12 of 12 intended edges.',
    ]);
    expect(res.audit.craft.envelopeSharp).toBe(0);
    expect(res.audit.ports[0].check).toBe('ok');
  }, 60000);
});
