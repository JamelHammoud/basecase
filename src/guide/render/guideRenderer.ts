import * as THREE from 'three';
import type { ScenePart } from '../../types/robotics';
import { buildPartGroup, releasePartGroup } from '../../three/buildPartMesh';
import { loadPartMeshes } from '../../three/thumbnailRender';
import type { GuideArrow, V3 } from '../guideTypes';
import { frameBoxes, projectPoint, VIEW_DIRECTIONS, type Frame } from './guideCamera';
import { idMaterial, toonMaterial } from './guideShaders';
import { GuideStage, type StagePart } from './guideStage';

export interface DrawRequest {
  ids: string[];
  newIds: ReadonlySet<string>;
  offsets?: ReadonlyMap<string, V3>;
  dir?: V3;
  maxWidth: number;
  maxHeight: number;
  frameIds?: string[];
  capIds?: string[];
  capZoom?: number;
  arrows?: GuideArrow[];
  points?: V3[];
}

export interface Drawing {
  dataUrl: string;
  width: number;
  height: number;
  arrows: Array<{ from: [number, number]; to: [number, number]; style: GuideArrow['style'] }>;
  points: Array<[number, number]>;
}

interface Entry extends StagePart {
  key: string;
  base: THREE.Vector3;
  originals: Array<THREE.Material | THREE.Material[]>;
}

const VISIBILITY_PX = 160;
const MARGIN_SHARE = 0.03;

function displayColor(material: THREE.Material | THREE.Material[], fallback: string): THREE.Vector3 {
  const first = Array.isArray(material) ? material[0] : material;
  const source = (first as THREE.MeshStandardMaterial | undefined)?.color ?? new THREE.Color(fallback);
  const hsl = { h: 0, s: 0, l: 0 };
  const out = new THREE.Color();

  source.getHSL(hsl, THREE.SRGBColorSpace);
  out.setHSL(hsl.h, Math.min(hsl.s, 0.85), Math.min(0.94, Math.max(0.22, hsl.l)), THREE.SRGBColorSpace);

  const rgb = out.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace);

  return new THREE.Vector3(rgb.r, rgb.g, rgb.b);
}

const isOverlay = (o: THREE.Object3D) =>
  Boolean((o as THREE.Line).isLine || (o as THREE.Points).isPoints || (o as THREE.Sprite).isSprite);

function makeEntry(part: ScenePart, key: string): Entry {
  const group = buildPartGroup(part, false, { shareGeometry: true });
  const meshes: Entry['meshes'] = [];
  const originals: Entry['originals'] = [];

  group.traverse((o) => {
    const mesh = o as THREE.Mesh;

    if (!mesh.isMesh) {
      o.visible = o.visible && !isOverlay(o);

      return;
    }

    const toon = toonMaterial();

    toon.uniforms.color.value.copy(displayColor(mesh.material, part.color));
    originals.push(mesh.material);
    meshes.push({ mesh, toon });
  });

  return { key, group, meshes, originals, idMaterial: idMaterial(), index: 0, base: group.position.clone() };
}

export class GuideRenderer {
  private readonly stage = new GuideStage();
  private readonly entries = new Map<string, Entry>();
  private readonly root = new THREE.Group();

  constructor() {
    this.stage.scene.add(this.root);
  }

  async sync(parts: ScenePart[], keys: Record<string, string>): Promise<void> {
    const changed = parts.filter((p) => this.entries.get(p.id)?.key !== keys[p.id]);

    await loadPartMeshes(changed);

    for (const [id, entry] of this.entries) if (keys[id] !== entry.key) this.release(id, entry);

    for (const part of changed) {
      const entry = makeEntry(part, keys[part.id]);

      this.entries.set(part.id, entry);
      this.root.add(entry.group);
    }

    [...this.entries.values()].forEach((entry, i) => (entry.index = i + 1));
  }

  private release(id: string, entry: Entry) {
    entry.meshes.forEach(({ mesh, toon }, i) => {
      mesh.material = entry.originals[i];
      toon.dispose();
    });
    entry.idMaterial.dispose();
    entry.group.position.copy(entry.base);
    this.root.remove(entry.group);
    releasePartGroup(entry.group);
    this.entries.delete(id);
  }

  ready(): Promise<void> {
    return this.stage.ready();
  }

  flush(): Promise<void> {
    return this.stage.flush();
  }

  group(id: string): THREE.Group | undefined {
    return this.entries.get(id)?.group;
  }

  ids(): string[] {
    return [...this.entries.keys()];
  }

  showAll() {
    const ids = this.ids();

    this.arrange({ ids, newIds: new Set(ids) });
  }

  private arrange(req: Pick<DrawRequest, 'ids' | 'newIds' | 'offsets'>): Entry[] {
    const shown = new Set(req.ids);
    const active: Entry[] = [];

    for (const [id, entry] of this.entries) {
      const visible = shown.has(id);
      const offset = req.offsets?.get(id);

      entry.group.visible = visible;
      entry.group.position.copy(entry.base);

      if (offset) entry.group.position.add(new THREE.Vector3(...offset));

      if (!visible) continue;

      const isNew = req.newIds.has(id);

      entry.idMaterial.uniforms.idColor.value.set(
        (entry.index % 256) / 255,
        Math.floor(entry.index / 256) / 255,
        isNew ? 1 : 0.5,
      );
      entry.meshes.forEach(({ toon }) => (toon.uniforms.ghost.value = isNew ? 0 : 1));
      active.push(entry);
    }

    this.root.updateMatrixWorld(true);

    return active;
  }

  private boxesOf(ids: string[]): THREE.Box3[] {
    return ids.flatMap((id) => {
      const g = this.entries.get(id)?.group;

      return g?.visible ? [new THREE.Box3().setFromObject(g)] : [];
    });
  }

  private frame(ids: string[], dir: V3, depthIds: string[] = ids): Frame {
    const boxes = this.boxesOf(ids);
    const all = boxes.reduce((acc, b) => acc.union(b), new THREE.Box3());
    const margin = all.isEmpty() ? 1 : all.getSize(new THREE.Vector3()).length() * MARGIN_SHARE;
    const fallback = [new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1))];
    const framed = boxes.length ? boxes : fallback;

    return frameBoxes(framed, dir, margin, depthIds === ids ? framed : [...framed, ...this.boxesOf(depthIds)]);
  }

  private scaleFor(req: DrawRequest, dir: V3): number {
    this.arrange(req);

    const frame = this.frame(req.frameIds ?? req.ids, dir, req.ids);
    const fit = Math.min(req.maxWidth / frame.widthMm, req.maxHeight / frame.heightMm);

    if (!req.capIds?.length) return fit;

    this.arrange({ ids: req.capIds, newIds: req.newIds });

    const cap = this.frame(req.capIds, dir);
    const capFit = Math.min(req.maxWidth / cap.widthMm, req.maxHeight / cap.heightMm) * (req.capZoom ?? 2);

    return Math.min(fit, capFit);
  }

  draw(req: DrawRequest): Drawing {
    const dir = req.dir ?? VIEW_DIRECTIONS.front;
    const scale = this.scaleFor(req, dir);
    const active = this.arrange(req);
    const frame = this.frame(req.frameIds ?? req.ids, dir, req.ids);
    const width = Math.max(8, Math.round(frame.widthMm * scale));
    const height = Math.max(8, Math.round(frame.heightMm * scale));
    const image = this.stage.draw(active, frame.camera, { width, height });
    const arrows = (req.arrows ?? []).map((a) => ({
      from: projectPoint(frame.camera, a.from, width, height),
      to: projectPoint(frame.camera, a.to, width, height),
      style: a.style,
    }));
    const points = (req.points ?? []).map((p) => projectPoint(frame.camera, p, width, height));

    const drawing: Drawing = { dataUrl: '', width, height, arrows, points };

    void image.then((url) => (drawing.dataUrl = url)).catch(() => undefined);

    return drawing;
  }

  visibleShare(req: Pick<DrawRequest, 'ids' | 'newIds' | 'offsets'>, dir: V3): number {
    const fresh = req.ids.filter((id) => req.newIds.has(id));

    if (!fresh.length) return 1;

    const active = this.arrange(req);
    const frame = this.frame(req.ids, dir);
    const k = VISIBILITY_PX / Math.max(frame.widthMm, frame.heightMm);
    const size = {
      width: Math.max(8, Math.round(frame.widthMm * k)),
      height: Math.max(8, Math.round(frame.heightMm * k)),
    };
    const seen = this.stage.countNew(active, frame.camera, size);
    const alone = this.stage.countNew(this.arrange({ ...req, ids: fresh }), frame.camera, size);

    return alone ? seen / alone : 1;
  }

  drawActualSize(id: string, pxPerMm: number): { dataUrl: string; widthMm: number; heightMm: number } | null {
    const entry = this.entries.get(id);

    if (!entry) return null;

    const saved = entry.group.quaternion.clone();

    entry.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0));

    try {
      const active = this.arrange({
        ids: [id],
        newIds: new Set([id]),
        offsets: new Map([[id, entry.base.clone().negate().toArray() as V3]]),
      });
      const frame = frameBoxes([new THREE.Box3().setFromObject(entry.group)], [0, 0.5, 1], 0.6);
      const width = Math.round(frame.widthMm * pxPerMm);
      const height = Math.round(frame.heightMm * pxPerMm);

      const actual = { dataUrl: '', widthMm: frame.widthMm, heightMm: frame.heightMm };

      void this.stage
        .draw(active, frame.camera, { width, height })
        .then((url) => (actual.dataUrl = url))
        .catch(() => undefined);

      return actual;
    } finally {
      entry.group.quaternion.copy(saved);
    }
  }

  dispose() {
    for (const [id, entry] of this.entries) this.release(id, entry);

    this.stage.dispose();
  }
}
