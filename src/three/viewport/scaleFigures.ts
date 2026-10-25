import * as THREE from 'three';
import { loadFigure } from './figureModels';
import { pickAt } from './measurements';
import { DEFAULT_HUMAN_HEIGHT_MM, type FigureKind, type Vec3 } from './types';
import type { ViewportContext } from './viewportContext';

const GHOST_COLOR = 0x8fd2ff;
const GHOST_GLOW = 0x2b95ff;
const PLACED_OPACITY = 0.42;
const PREVIEW_OPACITY = 0.2;
const PLACED_ORDER = 900;
const PREVIEW_ORDER = 902;
const KINDS: FigureKind[] = ['human', 'dog'];

interface Ghost {
  group: THREE.Group;
  materials: THREE.Material[];
}

function ghost(geometry: THREE.BufferGeometry, opacity: number, order: number): Ghost {
  const depth = new THREE.MeshBasicMaterial({ colorWrite: false, transparent: true });
  const fill = new THREE.MeshStandardMaterial({
    color: GHOST_COLOR,
    emissive: GHOST_GLOW,
    emissiveIntensity: 0.3,
    roughness: 0.5,
    metalness: 0,
    transparent: true,
    opacity,
    depthWrite: false,
  });
  const group = new THREE.Group();

  [depth, fill].forEach((material, i) => {
    const mesh = new THREE.Mesh(geometry, material);

    mesh.renderOrder = order + i;
    mesh.raycast = () => {};
    group.add(mesh);
  });
  group.visible = false;

  return { group, materials: [depth, fill] };
}

export class ScaleFigures {
  readonly group = new THREE.Group();

  private readonly ctx: ViewportContext;

  private readonly geometries = new Map<FigureKind, THREE.BufferGeometry>();

  private readonly loading = new Set<FigureKind>();

  private disposed = false;

  private readonly placed = new Map<FigureKind, Ghost>();

  private readonly previews = new Map<FigureKind, Ghost>();

  private pointer: { x: number; y: number } | null = null;

  private frame = 0;

  constructor(ctx: ViewportContext) {
    this.ctx = ctx;
    this.group.name = 'scale-figures';
    ctx.stage.overlays.add(this.group);
  }

  sync(): void {
    const { figures = {}, measureMode } = this.ctx.props();

    if (measureMode) KINDS.forEach((kind) => this.geometry(kind));

    KINDS.forEach((kind) => {
      const point = figures[kind];
      const placed = point ? this.ghostFor(this.placed, kind) : null;

      if (point && placed) this.show(placed, point);
      else this.hide(this.placed.get(kind));
    });

    if (!measureMode || !this.activeKind()) this.leave();
    else this.drawPreview();
  }

  hoverAt(clientX: number, clientY: number): void {
    this.pointer = { x: clientX, y: clientY };

    if (this.frame) return;

    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.drawPreview();
    });
  }

  leave(): void {
    this.pointer = null;
    this.previews.forEach((preview) => this.hide(preview));
    this.ctx.loop.invalidate();
  }

  clickAt(clientX: number, clientY: number): void {
    const kind = this.activeKind();
    const hit = pickAt(this.ctx, clientX, clientY);

    if (kind && hit) this.ctx.props().onPlaceFigure?.(kind, hit.point);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.ctx.stage.overlays.remove(this.group);
    [...this.placed.values(), ...this.previews.values()].forEach((g) => g.materials.forEach((m) => m.dispose()));
  }

  private activeKind(): FigureKind | null {
    const kind = this.ctx.props().measureKind;

    return kind === 'human' || kind === 'dog' ? kind : null;
  }

  private drawPreview(): void {
    const kind = this.activeKind();
    const hit = this.pointer && kind ? pickAt(this.ctx, this.pointer.x, this.pointer.y) : null;
    const preview = hit && kind ? this.ghostFor(this.previews, kind) : null;

    this.previews.forEach((other) => other !== preview && this.hide(other));

    if (preview && hit) this.show(preview, hit.point);

    this.ctx.loop.invalidate();
  }

  private show({ group }: Ghost, point: Vec3): void {
    const scale = group.userData.kind === 'human' ? (this.ctx.props().humanHeightMm ?? DEFAULT_HUMAN_HEIGHT_MM) : 1;

    group.position.set(...point);
    group.scale.setScalar(scale);
    group.visible = true;
  }

  private hide(ghostGroup: Ghost | undefined): void {
    if (ghostGroup) ghostGroup.group.visible = false;
  }

  private ghostFor(pool: Map<FigureKind, Ghost>, kind: FigureKind): Ghost | null {
    const existing = pool.get(kind);
    const geometry = this.geometry(kind);

    if (existing || !geometry) return existing ?? null;

    const preview = pool === this.previews;
    const made = ghost(geometry, preview ? PREVIEW_OPACITY : PLACED_OPACITY, preview ? PREVIEW_ORDER : PLACED_ORDER);

    made.group.userData.kind = kind;
    pool.set(kind, made);
    this.group.add(made.group);

    return made;
  }

  private geometry(kind: FigureKind): THREE.BufferGeometry | null {
    const ready = this.geometries.get(kind);

    if (ready || this.loading.has(kind)) return ready ?? null;

    this.loading.add(kind);
    loadFigure(kind)
      .then((geometry) => this.loaded(kind, geometry))
      .catch(() => this.loading.delete(kind));

    return null;
  }

  private loaded(kind: FigureKind, geometry: THREE.BufferGeometry): void {
    this.loading.delete(kind);

    if (this.disposed) return;

    this.geometries.set(kind, geometry);
    this.sync();
    this.drawPreview();
  }
}
