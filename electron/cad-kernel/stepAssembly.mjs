import { facetShare } from './stepFacets.mjs';
import { stepName } from './stepPolicy.mjs';
import { createSolidBuilder, trsfOf } from './stepSolids.mjs';

const STEP_FILE = '/assembly.step';
const AP214 = 5;

const meshesOf = (bodies) =>
  bodies
    .map((b) => b.solid)
    .flatMap(function walk(solid) {
      if (!solid) return [];

      if (solid.type === 'mesh') return [solid.positions];

      if (solid.type === 'moved') return walk(solid.solid);

      return solid.type === 'boolean' ? solid.solids.flatMap(walk) : [];
    });

function createDocument(oc) {
  const doc = new oc.TDocStd_Document(new oc.TCollection_ExtendedString('XmlOcaf', true));

  oc.XCAFDoc_ShapeTool.SetAutoNaming(false);

  const main = doc.Main();

  return {
    doc,
    shapes: oc.XCAFDoc_DocumentTool.ShapeTool(main),
    colors: oc.XCAFDoc_DocumentTool.ColorTool(main),
  };
}

function colorOf(oc, hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

  return new oc.Quantity_ColorRGBA(r, g, b, 1);
}

function lumpsOf(oc, shape) {
  if (shape.ShapeType() !== oc.TopAbs_ShapeEnum.TopAbs_COMPOUND) return [];

  const lumps = [];
  const explorer = new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);

  for (; explorer.More(); explorer.Next()) lumps.push(explorer.Current());

  return lumps;
}

function createAssembly(oc, sceneName) {
  const { doc, shapes, colors } = createDocument(oc);
  const named = (label, text, fallback) => {
    oc.TDataStd_Name.Set(label, new oc.TCollection_ExtendedString(stepName(text, fallback), true));

    return label;
  };
  const root = named(shapes.NewShape(), sceneName, 'Assembly');
  const groups = new Map();
  const parentOf = (group) => {
    if (group === undefined) return root;

    if (!groups.has(group)) groups.set(group, named(shapes.NewShape(), group, 'Group'));

    return groups.get(group);
  };

  return {
    add(body, shape) {
      const lumps = lumpsOf(oc, shape);
      const simple = (piece) => {
        const label = named(shapes.AddShape(piece, false, false), body.name, 'Part');

        colors.SetColor(label, colorOf(oc, body.color), oc.XCAFDoc_ColorType.XCAFDoc_ColorSurf);

        return label;
      };
      const part = lumps.length > 1 ? named(shapes.NewShape(), body.name, 'Part') : simple(shape);

      if (lumps.length > 1) for (const lump of lumps) shapes.AddComponent(part, simple(lump), new oc.TopLoc_Location());

      const placed = new oc.TopLoc_Location(trsfOf(oc, body.place));

      named(shapes.AddComponent(parentOf(body.group), part, placed), body.name, 'Part');
    },
    finish() {
      for (const label of groups.values()) shapes.AddComponent(root, label, new oc.TopLoc_Location());

      shapes.UpdateAssemblies();

      return doc;
    },
  };
}

function writeStep(oc, doc) {
  const writer = new oc.STEPCAFControl_Writer(new oc.XSControl_WorkSession(), false);

  writer.SetColorMode(true);
  writer.SetNameMode(true);
  writer.SetLayerMode(false);
  oc.Interface_Static.SetCVal('xstep.cascade.unit', 'MM');
  oc.Interface_Static.SetCVal('write.step.unit', 'MM');
  oc.Interface_Static.SetIVal('write.step.schema', AP214);
  oc.Interface_Static.SetIVal('write.step.assembly', 2);
  oc.Interface_Static.SetIVal('write.surfacecurve.mode', 0);
  oc.Interface_Static.SetIVal('write.precision.mode', 0);

  if (!writer.Perform(doc, STEP_FILE, new oc.Message_ProgressRange()))
    throw new Error('OpenCascade could not write the STEP file.');

  const text = new TextDecoder().decode(oc.FS.readFile(STEP_FILE));

  oc.FS.unlink(STEP_FILE);

  return text;
}

async function firstBuilt(build, body) {
  for (const solid of [body.solid, body.fallback]) {
    if (!solid) continue;

    try {
      return await build(solid);
    } catch {}
  }

  return null;
}

export async function exportStepAssembly(api, { job, shapeOfCode }) {
  const { oc } = api;
  const { build } = createSolidBuilder({ api, shapeOfCode, facetShare: await facetShare(meshesOf(job.bodies)) });
  const assembly = createAssembly(oc, job.name);
  let skipped = 0;

  for (const body of job.bodies) {
    const shape = await firstBuilt(build, body);

    if (shape && !shape.IsNull()) assembly.add(body, shape);
    else skipped += 1;
  }

  if (skipped === job.bodies.length) throw new Error('None of the parts could be built.');

  return { ok: true, step: writeStep(oc, assembly.finish()), skipped };
}
