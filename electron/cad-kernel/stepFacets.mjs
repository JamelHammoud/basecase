import { MeshoptSimplifier } from 'meshoptimizer';
import { weld } from '../cadImport/partGlb.mjs';

export const FACET_BUDGET = 40_000;
export const BODY_FACETS = 6_000;

const CLOSE_ERROR = 0.002;
const COARSE_ERROR = 0.02;
const OVER_TARGET = 1.5;
const SEW_TOLERANCE = 1e-4;
const STL_FILE = '/facets.stl';
const BINARY_MARK = 0xff;

function binaryStl(positions, indices) {
  const count = indices.length / 3;
  const bytes = new ArrayBuffer(84 + count * 50);
  const view = new DataView(bytes);

  new Uint8Array(bytes, 0, 80).fill(BINARY_MARK);

  view.setUint32(80, count, true);

  for (let t = 0; t < count; t++)
    for (let corner = 0; corner < 3; corner++)
      for (let axis = 0; axis < 3; axis++)
        view.setFloat32(96 + t * 50 + corner * 12 + axis * 4, positions[indices[t * 3 + corner] * 3 + axis], true);

  return new Uint8Array(bytes);
}

export async function facetShare(meshes) {
  await MeshoptSimplifier.ready;

  const total = meshes.reduce((n, m) => n + m.length / 9, 0);

  return Math.min(1, FACET_BUDGET / Math.max(1, total));
}

function simplified(soup, share) {
  const welded = weld(Array.from(soup));
  const triangles = welded.indices.length / 3;
  const target = Math.min(BODY_FACETS, Math.ceil(triangles * share));

  if (triangles <= target) return welded;

  const within = (error) => MeshoptSimplifier.simplify(welded.indices, welded.positions, 3, target * 3, error)[0];
  const close = within(CLOSE_ERROR);
  const indices = close.length > target * 3 * OVER_TARGET ? within(COARSE_ERROR) : close;

  return indices.length ? { positions: welded.positions, indices } : welded;
}

function* shellsOf(oc, shape) {
  const explorer = new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum.TopAbs_SHELL, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);

  for (; explorer.More(); explorer.Next()) yield oc.TopoDS.Shell(explorer.Current());
}

function solidsOf(oc, shape) {
  const solids = [...shellsOf(oc, shape)].map((shell) => new oc.ShapeFix_Solid().SolidFromShell(shell));

  if (solids.length < 2) return solids[0] ?? shape;

  const builder = new oc.TopoDS_Builder();
  const compound = new oc.TopoDS_Compound();

  builder.MakeCompound(compound);

  for (const solid of solids) builder.Add(compound, solid);

  return compound;
}

export function facetedSolid({ oc }, { positions }, share) {
  const { positions: points, indices } = simplified(positions, share);

  if (!indices.length) throw new Error('The mesh is empty.');

  oc.FS.writeFile(STL_FILE, binaryStl(points, indices));

  const faces = new oc.TopoDS_Shell();
  const read = new oc.StlAPI_Reader().Read(faces, STL_FILE);

  oc.FS.unlink(STL_FILE);

  if (!read) throw new Error('The mesh could not be read.');

  const sewing = new oc.BRepBuilderAPI_Sewing(SEW_TOLERANCE, true, true, true, false);

  sewing.Load(faces);
  sewing.Perform(new oc.Message_ProgressRange());

  const unify = new oc.ShapeUpgrade_UnifySameDomain(sewing.SewedShape(), true, true, false);

  unify.Build();

  return solidsOf(oc, unify.Shape());
}
