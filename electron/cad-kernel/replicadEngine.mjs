import { measure } from './kernelMesh.mjs';
import { portsFromObjects } from './ports.mjs';
import { occMessage, replicadScope, unwrapResult, wrapCode } from './replicadSupport.mjs';

function replicadHints(msg) {
  if (/has been deleted/i.test(msg)) {
    return [
      'Hint: replicad consumes shapes: fuse, cut, intersect, fillet, chamfer, shell, translate and rotate return a new shape and delete the old one. Reassign the result (s = s.fuse(b)) and call .clone() before reusing a shape twice.',
    ];
  }

  if (/previous curve|tangent arc/i.test(msg)) {
    return [
      'Hint: tangent arcs (tangentArcTo, smoothSplineTo) need a straight segment or curve before them in the same drawing. Start with movePointerTo + lineTo, or use threePointsArcTo.',
    ];
  }

  if (/is not a function/i.test(msg)) {
    return [
      'Hint: check the method exists on that object (sketches extrude/revolve/loftWith; drawings sketchOnPlane; 3D shapes fuse/cut/fillet/shell/translate/rotate).',
    ];
  }

  return [];
}

async function runAgentCode(api, code) {
  const scope = replicadScope(api.replicad);
  const names = Object.keys(scope);
  const run = new Function(...names, wrapCode(code));

  try {
    return await run(...names.map((n) => scope[n]));
  } catch (err) {
    const message = occMessage(api.oc, err);

    throw new Error([message, ...replicadHints(message)].join('\n'), { cause: err });
  }
}

function meshOf(api, shape) {
  const mesh = shape.mesh({ tolerance: 0.05, angularTolerance: 0.15 });
  let edges = null;

  try {
    const e = shape.meshEdges({ tolerance: 0.05, angularTolerance: 0.15 });

    edges = Array.from(e.lines ?? []).map((v) => Math.round(v * 1000) / 1000);
  } catch {}

  const positions = Array.from(mesh.vertices).map((v) => Math.round(v * 1000) / 1000);
  const indices = Array.from(mesh.triangles);
  const stats = measure(positions, indices);

  try {
    stats.volume = Math.round(api.replicad.measureVolume(shape));
  } catch {}

  return { positions, indices, edges, stats };
}

export function createReplicadEngine({ replicad }) {
  let loading = null;
  const load = () => {
    loading ??= replicad().catch((err) => {
      loading = null;

      throw err;
    });

    return loading;
  };

  return {
    async render(code) {
      const api = await load();

      const { shape, ports: declared, notes } = unwrapResult(await runAgentCode(api, code));

      if (!shape || typeof shape.mesh !== 'function') {
        throw new Error(
          'The code must `return` a replicad 3D shape (e.g. return sketch.extrude(10)), or { shape, ports }.',
        );
      }

      const mesh = meshOf(api, shape);
      const { ports, problems } = portsFromObjects(declared);

      return { ...mesh, warnings: [...notes, ...problems], ports };
    },
    prewarm() {
      load().catch(() => {});
    },
  };
}
