import type { CustomModelSubNode, ScenePart } from '../../types/robotics';

const finiteVector = (v: unknown) =>
  Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(n) && Math.abs(n) <= 1e6);
const KINDS = new Set(['box', 'cube', 'cad_part', 'custom_model']);

function safeNode(node: CustomModelSubNode) {
  const contour = node.contour;
  const points = contour ? contour.outerLoop.length + (contour.holes ?? []).reduce((n, loop) => n + loop.length, 0) : 0;
  const lathe = node.lathe;

  return (
    finiteVector(node.position) &&
    finiteVector(node.rotation) &&
    !node.deformers &&
    !node.sculptMesh &&
    points <= 512 &&
    (!lathe || (lathe.profilePoints.length <= 512 && (lathe.segments ?? 32) <= 64))
  );
}

export function supportedSourceTransform(part: ScenePart) {
  const d = part.dimensions;

  return (
    KINDS.has(part.kind) &&
    finiteVector(part.position) &&
    finiteVector(part.rotation) &&
    !!d &&
    [d.width, d.height, d.depth].every((v) => Number.isFinite(v) && v > 0 && v <= 1e6) &&
    !part.sheetTransform &&
    !part.deformers &&
    !part.sculptMesh &&
    (!part.customNodes || (part.customNodes.length <= 16 && part.customNodes.every(safeNode)))
  );
}
