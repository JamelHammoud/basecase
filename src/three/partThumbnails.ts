import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CatalogItem, ScenePart } from '../types/robotics';
import { buildPartGroup } from './buildPartMesh';
import { useEffect, useState } from 'react';
import { catalogKey, catalogRef } from '../data/catalog';
import { getComponentMesh, loadComponentMesh } from './componentMeshes';

/**
 * Renders small studio-lit thumbnails of catalog parts with one shared offscreen
 * WebGL renderer. Results are cached as data URLs for the Parts grid.
 */

// 2× the largest display size (hover card hero), so thumbnails stay sharp on Retina
const WIDTH = 480;
const HEIGHT = 360;
const cache = new Map<string, string>();

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;

function ensureRenderer() {
  if (renderer && scene && camera) return { renderer, scene, camera };
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(WIDTH, HEIGHT, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.setClearColor(0x000000, 0);

  scene = new THREE.Scene();
  // A soft studio room for metals to reflect; without it screws and bearings render black
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x1a1a1e, 1.4));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(120, 220, 160);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fd3ff, 0.6);
  rim.position.set(-160, 80, -120);
  scene.add(rim);

  camera = new THREE.PerspectiveCamera(30, WIDTH / HEIGHT, 1, 4000);
  return { renderer, scene, camera };
}

function partFromCatalog(item: CatalogItem): ScenePart {
  return {
    id: `thumb-${item.kind}`,
    name: item.name,
    kind: item.kind,
    category: item.category,
    role: item.defaultRole,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    dimensions: { ...item.defaultDimensions },
    color: item.defaultColor,
    note: '',
    visible: true,
    locked: false,
    hardware: item.hardware,
    componentId: item.componentId,
  };
}

function disposeObject(obj: THREE.Object3D) {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    // Component meshes are shared with the scene
    if (mesh.geometry && !mesh.geometry.userData.shared) mesh.geometry.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat?.dispose();
  });
}

/** `key` caches a specific variant (e.g. an M3 × 40 screw); defaults to the entry's key */
export function renderCatalogThumbnail(item: CatalogItem, key = catalogKey(item)): string {
  const cached = cache.get(key);
  if (cached) return cached;
  // Components render once their mesh is in (see usePartThumbnail)
  if (item.componentId && !getComponentMesh(item.componentId)) return '';
  try {
    const group = buildPartGroup(partFromCatalog(item), false);
    return renderGroup(group, key, 0.92);
  } catch {
    return '';
  }
}

/**
 * A whole scene or library model, lit like the Parts thumbnails: solid, visible parts only
 * (no cutouts, guides or reference photos). Components must already be loaded (usePartsThumbnail).
 */
export function renderPartsThumbnail(parts: ScenePart[], key: string): string {
  const cached = cache.get(key);
  if (cached) return cached;
  const shown = thumbnailParts(parts);
  if (shown.length === 0) return '';
  try {
    const group = new THREE.Group();
    for (const part of shown) {
      // buildPartGroup places the part at its position and rotation
      group.add(buildPartGroup(part, false));
    }
    // Assemblies have more empty space around them than one part; frame a little looser
    return renderGroup(group, key, 1.0);
  } catch {
    return '';
  }
}

const thumbnailParts = (parts: ScenePart[]) =>
  parts.filter((p) => p.visible && p.kind !== 'image_plane' && p.role === 'solid');

/** Frames `group` from the studio's three-quarter view, renders it, caches it under `key` and disposes it */
function renderGroup(group: THREE.Group, key: string, tightness: number): string {
  const { renderer: r, scene: s, camera: c } = ensureRenderer();

  // Lift dark parts slightly so they read on a dark tile
  group.traverse((child) => {
    const line = child as THREE.LineSegments;
    if (line.isLineSegments) {
      const m = line.material as THREE.LineBasicMaterial;
      m.opacity = Math.min(1, m.opacity + 0.25);
    }
  });

  s.add(group);
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.length() / 2, 1);
  const dist = (radius / Math.sin(THREE.MathUtils.degToRad(c.fov / 2))) * tightness;
  const dir = new THREE.Vector3(1, 0.75, 1.15).normalize();
  c.position.copy(center).addScaledVector(dir, dist);
  c.near = dist / 50;
  c.far = dist * 10;
  c.updateProjectionMatrix();
  c.lookAt(center);

  // Dark parts (black servos, black-oxide screws) vanish on dark tiles: expose them brighter
  let sum = 0;
  let n = 0;
  group.traverse((obj) => {
    const mat = (obj as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if ((obj as THREE.Mesh).isMesh && mat?.color) {
      const hsl = { h: 0, s: 0, l: 0 };
      mat.color.getHSL(hsl, THREE.SRGBColorSpace);
      sum += hsl.l;
      n++;
    }
  });
  const lightness = n ? sum / n : 0.5;
  r.toneMappingExposure = lightness < 0.15 ? 1.6 : lightness < 0.3 ? 1.35 : 1.15;
  r.render(s, c);
  const url = r.domElement.toDataURL('image/png');
  s.remove(group);
  disposeObject(group);
  cache.set(key, url);
  return url;
}

export function getCachedThumbnail(key: string): string | undefined {
  return cache.get(key);
}

/**
 * A thumbnail for one catalog entry at its exact spec, rendered after mount (components wait
 * for their mesh). Shared cache, so tiles, rows and previews of the same variant render once.
 */
export function usePartThumbnail(item: CatalogItem | undefined): string | undefined {
  const key = item ? catalogRef(item) : '';
  const [state, setState] = useState<{ key: string; url?: string }>(() => ({ key, url: getCachedThumbnail(key) }));
  useEffect(() => {
    if (!item) return;
    const cached = getCachedThumbnail(key);
    if (cached) {
      setState({ key, url: cached });
      return;
    }
    let off = false;
    const run = () => {
      const url = renderCatalogThumbnail(item, key);
      if (!off && url) setState({ key, url });
    };
    let frame = 0;
    if (item.componentId) loadComponentMesh(item.componentId).then(run).catch(() => {});
    else frame = requestAnimationFrame(run);
    return () => {
      off = true;
      cancelAnimationFrame(frame);
    };
    // `key` identifies the variant
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state.key === key ? state.url : getCachedThumbnail(key);
}

/**
 * A thumbnail of several parts (a library scene or model) under `key`, rendered after mount once
 * their component meshes are in. `key` should change whenever the parts do (e.g. id + updatedAt).
 * Returns '' when there's nothing solid to show.
 */
export function usePartsThumbnail(key: string, getParts: () => ScenePart[]): string | undefined {
  const [state, setState] = useState<{ key: string; url?: string }>(() => ({ key, url: getCachedThumbnail(key) }));
  useEffect(() => {
    const cached = getCachedThumbnail(key);
    if (cached !== undefined) {
      setState({ key, url: cached });
      return;
    }
    let off = false;
    let frame = 0;
    const parts = getParts();
    const ids = [...new Set(thumbnailParts(parts).map((p) => p.componentId).filter((id): id is string => !!id))];
    Promise.allSettled(ids.map((id) => loadComponentMesh(id))).then(() => {
      // One frame later, so a grid of tiles doesn't render all at once while the panel opens
      frame = requestAnimationFrame(() => {
        if (off) return;
        const url = renderPartsThumbnail(parts, key);
        if (!url) cache.set(key, '');
        setState({ key, url });
      });
    });
    return () => {
      off = true;
      cancelAnimationFrame(frame);
    };
    // `key` identifies the content
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state.key === key ? state.url : getCachedThumbnail(key);
}
