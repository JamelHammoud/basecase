import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ScenePart } from '../../types/robotics';
import { getComponentMesh } from '../componentMeshes';
import { buildHardwarePieces, type HardwareMaterials } from '../hardwareMesh';
import { plainMesh, type BuildContext } from './context';
import { creaseEdgesOnly } from './creaseEdges';
import { cadEdgeMaterial, createMaterial, highlightEdgeMaterial } from './materials';
import { disposeCachedGeometry, objectKey } from './sharedGeometry';
import type { PartBuilder } from './primitives';

interface MeshSource {
  positions: number[];
  indices: number[];
  baseSize: [number, number, number];
}

const scaleOf = (ctx: BuildContext, base: [number, number, number]) =>
  [ctx.width / base[0], ctx.height / base[1], ctx.depth / base[2]].map((v) => (Number.isFinite(v) && v > 0 ? v : 1));

const creasedGeometry = (src: MeshSource, creaseDeg: number, scale: number[]) => {
  let geometry = new THREE.BufferGeometry();

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(src.positions, 3));
  geometry.setIndex(src.indices);
  geometry = toCreasedNormals(geometry, THREE.MathUtils.degToRad(creaseDeg));
  geometry.scale(scale[0], scale[1], scale[2]);

  return geometry;
};

const sharedCreased = (ctx: BuildContext, src: MeshSource, creaseDeg: number) => {
  const scale = scaleOf(ctx, src.baseSize);

  return ctx.derive(
    `${objectKey(src)}|crease${creaseDeg}|${scale.join(',')}`,
    () => creasedGeometry(src, creaseDeg, scale),
    disposeCachedGeometry,
  );
};

const sharedEdges = (ctx: BuildContext, geometry: THREE.BufferGeometry, build: () => THREE.BufferGeometry) =>
  ctx.derive(`${objectKey(geometry)}|edges`, build, disposeCachedGeometry);

const cadEdges = (cad: NonNullable<ScenePart['cad']>, geometry: THREE.BufferGeometry, scale: number[]) => {
  if (!cad.edges || cad.edges.length < 6) {
    return new THREE.EdgesGeometry(geometry, 30);
  }

  const edges = new THREE.BufferGeometry();

  edges.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(creaseEdgesOnly(cad.edges, cad.positions, cad.indices), 3),
  );
  edges.scale(scale[0], scale[1], scale[2]);

  return edges;
};

const cadPart: PartBuilder = (ctx) => {
  const cad = ctx.part.cad;

  if (!cad || cad.positions.length < 9) {
    return;
  }

  const geometry = sharedCreased(ctx, cad, 32);
  const mesh = plainMesh(geometry, ctx.material(), ctx.part.role);
  const edges = sharedEdges(ctx, geometry, () => cadEdges(cad, geometry, scaleOf(ctx, cad.baseSize)));
  const lines = new THREE.LineSegments(edges, cadEdgeMaterial(ctx.part.role, ctx.selected));

  lines.name = 'cad-edges';
  lines.raycast = () => {};
  mesh.add(lines);
  ctx.group.add(mesh);
};

const showsHighlightEdges = (ctx: BuildContext) => ctx.selected || ctx.part.role === 'cutout';

const highlightLines = (edges: THREE.BufferGeometry, ctx: BuildContext, opacity: number) => {
  const lines = new THREE.LineSegments(edges, highlightEdgeMaterial(ctx.selected, opacity));

  lines.raycast = () => {};

  return lines;
};

const importedMesh: PartBuilder = (ctx) => {
  const src = ctx.part.mesh;

  if (!src || src.positions.length < 9) {
    return;
  }

  const geometry = sharedCreased(ctx, src, 30);
  const mesh = plainMesh(geometry, ctx.material(), ctx.part.role);

  if (showsHighlightEdges(ctx)) {
    mesh.add(
      highlightLines(
        sharedEdges(ctx, geometry, () => new THREE.EdgesGeometry(geometry, 35)),
        ctx,
        0.9,
      ),
    );
  }

  ctx.group.add(mesh);
};

const componentPart: PartBuilder = (ctx) => {
  const { part } = ctx;
  const loaded = part.componentId ? getComponentMesh(part.componentId) : null;

  if (!loaded) {
    const placeholder = createMaterial({ color: part.color, role: part.role, selected: ctx.selected });

    placeholder.transparent = true;
    placeholder.opacity = 0.25;
    placeholder.depthWrite = false;
    ctx.add(new THREE.BoxGeometry(ctx.width, ctx.height, ctx.depth), placeholder);

    return;
  }

  for (const piece of loaded.pieces) {
    const material =
      part.role === 'solid'
        ? createMaterial({
            color: piece.color,
            roughness: piece.roughness,
            metalness: piece.metalness,
            role: part.role,
            selected: ctx.selected,
          })
        : ctx.material();

    ctx.group.add(plainMesh(piece.geometry, material, part.role));
  }

  if (showsHighlightEdges(ctx)) ctx.group.add(highlightLines(loaded.edges, ctx, 0.7));
};

type HardwareSlot = keyof HardwareMaterials;

const SLOTS: HardwareSlot[] = ['main', 'dark', 'nylon'];

const hardwarePieces = (spec: NonNullable<ScenePart['hardware']>) => {
  const sentinels = Object.fromEntries(SLOTS.map((slot) => [slot, new THREE.MeshBasicMaterial({ name: slot })]));
  const pieces = buildHardwarePieces(spec, sentinels as unknown as HardwareMaterials).map((piece) => ({
    geometry: piece.geometry,
    slot: piece.material.name as HardwareSlot,
    edges: piece.edges,
  }));

  Object.values(sentinels).forEach((m) => m.dispose());

  return pieces;
};

const disposePieces = (pieces: ReturnType<typeof hardwarePieces>) => {
  new Set(pieces.map((p) => p.geometry)).forEach((g) => g.dispose());
};

const hardwarePart: PartBuilder = (ctx) => {
  const { part } = ctx;

  if (!part.hardware) {
    return;
  }

  const style = { role: part.role, selected: ctx.selected };
  const materials: Record<HardwareSlot, THREE.Material> = {
    main: createMaterial({ ...style, color: part.color, roughness: 0.3, metalness: 0.8 }),
    dark: createMaterial({ ...style, color: '#111114', roughness: 0.6, metalness: 0.3 }),
    nylon: createMaterial({ ...style, color: '#ebe6d8', roughness: 0.65, metalness: 0 }),
  };
  const pieces = ctx.derive(
    `hardware|${JSON.stringify(part.hardware)}`,
    () => hardwarePieces(part.hardware!),
    disposePieces,
  );

  for (const piece of pieces) {
    const material = materials[piece.slot];
    const withEdges = piece.edges && showsHighlightEdges(ctx);

    ctx.group.add(
      withEdges ? ctx.subMesh(piece.geometry, material, 40) : plainMesh(piece.geometry, material, part.role),
    );
  }
};

const imagePlane: PartBuilder = (ctx) => {
  const { part } = ctx;
  const opacity = part.opacity ?? 1;
  const geometry = new THREE.PlaneGeometry(ctx.width, ctx.height);
  const material = new THREE.MeshBasicMaterial({
    map: part.imageDataUrl ? imageTexture(part.imageDataUrl) : null,
    color: part.imageDataUrl ? 0xffffff : 0x3f3f46,
    side: THREE.DoubleSide,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  const frame = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({
      color: ctx.selected ? 0x0d99ff : 0xffffff,
      transparent: true,
      opacity: ctx.selected ? 1 : 0.18,
    }),
  );

  frame.raycast = () => {};
  mesh.add(frame);
  ctx.group.add(mesh);
};

const imageTextures = new Map<string, THREE.Texture>();

function imageTexture(url: string): THREE.Texture {
  const cached = imageTextures.get(url);

  if (cached) {
    return cached;
  }

  const texture = new THREE.TextureLoader().load(url);

  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  imageTextures.set(url, texture);

  return texture;
}

export const IMPORTED_BUILDERS: Record<string, PartBuilder> = {
  cad_part: cadPart,
  mesh: importedMesh,
  component: componentPart,
  hardware: hardwarePart,
  image_plane: imagePlane,
};
