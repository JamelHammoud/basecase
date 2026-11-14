import * as THREE from 'three';
import type { TilesRenderer } from '3d-tiles-renderer/three';
import type { EarthOrigin } from '../../earth/earthOrigin';
import { downRay, earthFrame, heightOf } from '../../earth/enu';
import { EarthFetchPlugin, type FetchTile } from '../../earth/tileFetch';
import { TILES_ROOT_URL } from '../../earth/tilePaths';

export interface EarthView {
  origin: EarthOrigin;
  fetchTile: FetchTile;
}

export interface EarthState {
  tiles: number;
  loaded: number;
  surfaceM: number | null;
  rootCenter: [number, number, number] | null;
  attribution: string;
}

interface Hooks {
  redraw: () => void;
  attribution: (text: string) => void;
}

interface TileEvent {
  tile: { engineData: { metadata?: { asset?: { copyright?: string } } } };
  visible: boolean;
}

interface BoundedTile {
  engineData: { boundingVolume?: { getSphere: (target: THREE.Sphere) => THREE.Sphere } };
}

const ERROR_TARGET = 20;
const PROBE_ABOVE_M = 9000;
const PROBE_FOV = 20;
const PROBE_FAR = 1e7;
const PROBE_PX = 512;
const PROBE_HEIGHT_MM = 50000;
const SURFACE_STEP_M = 0.01;

const ORIGIN_KEYS = ['lat', 'lon', 'altitudeM', 'offsetM', 'hidden'] as const;

const sameOrigin = (a: EarthOrigin | null, b: EarthOrigin | null) =>
  a === b || (!!a && !!b && ORIGIN_KEYS.every((key) => a[key] === b[key]));

function behindOverlays(scene: THREE.Object3D): void {
  scene.traverse((object) => {
    const { material } = object as THREE.Mesh;

    for (const m of [material ?? []].flat()) {
      m.polygonOffset = true;
      m.polygonOffsetFactor = 1;
      m.polygonOffsetUnits = 4;
    }
  });
}

export class EarthLayer {
  readonly group = new THREE.Group();

  private tiles: TilesRenderer | null = null;

  private fetchTile: FetchTile | null = null;

  private origin: EarthOrigin | null = null;

  private camera: THREE.Camera | null = null;

  private surfaceM: number | null = null;

  private generation = 0;

  private readonly probe = new THREE.PerspectiveCamera(PROBE_FOV, 1, 1, PROBE_FAR);

  private readonly credits = new Map<string, number>();

  private readonly hooks: Hooks;

  constructor(parent: THREE.Object3D, hooks: Hooks) {
    this.hooks = hooks;
    this.group.name = 'earth';
    this.group.matrixAutoUpdate = false;
    this.group.visible = false;
    parent.add(this.group);
  }

  async set(view: EarthView | null): Promise<void> {
    if (view?.fetchTile === this.fetchTile && sameOrigin(view?.origin ?? null, this.origin)) return;

    const generation = ++this.generation;

    if (!view || view.origin.hidden) {
      this.origin = view?.origin ?? null;
      this.show(false);

      return;
    }

    const moved = !this.origin || this.origin.lat !== view.origin.lat || this.origin.lon !== view.origin.lon;

    if (moved) this.surfaceM = null;

    this.origin = view.origin;

    if (view.fetchTile !== this.fetchTile && !(await this.start(view.fetchTile, generation))) return;

    this.place();
  }

  update(camera: THREE.Camera, width: number, height: number): void {
    const { tiles } = this;

    if (!tiles || !this.origin || this.origin.hidden) return;

    if (this.camera !== camera && this.camera) tiles.deleteCamera(this.camera);

    this.camera = camera;
    tiles.setCamera(camera);
    tiles.setResolution(camera, width, height);
    this.aimProbe();
    this.group.updateMatrixWorld(true);
    tiles.update();
  }

  state(): EarthState | null {
    const { tiles, origin } = this;

    if (!tiles || !origin || origin.hidden) return null;

    return {
      tiles: tiles.visibleTiles.size,
      loaded: tiles.loadProgress,
      surfaceM: this.surfaceM,
      rootCenter: this.rootCenter(),
      attribution: this.attribution(),
    };
  }

  visibleTiles(): Array<{ center: THREE.Vector3; error: number }> {
    return [...(this.tiles?.visibleTiles ?? [])].map((tile) => ({
      center: this.tileCenter(tile),
      error: (tile as { geometricError: number }).geometricError,
    }));
  }

  dispose(): void {
    this.stop();
    this.group.removeFromParent();
  }

  private stop(): void {
    this.tiles?.group.removeFromParent();
    this.tiles?.dispose();
    this.tiles = null;
  }

  private async start(fetchTile: FetchTile, generation: number): Promise<boolean> {
    const [{ TilesRenderer }, { GLTFExtensionsPlugin }, { dracoLoader }] = await Promise.all([
      import('3d-tiles-renderer/three'),
      import('3d-tiles-renderer/plugins'),
      import('../../earth/draco'),
    ]);

    if (generation !== this.generation) return false;

    this.stop();
    this.camera = null;
    this.credits.clear();
    this.fetchTile = fetchTile;

    const tiles = new TilesRenderer(TILES_ROOT_URL);

    tiles.registerPlugin(new EarthFetchPlugin(fetchTile));
    tiles.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader: dracoLoader() }));
    tiles.errorTarget = ERROR_TARGET;
    tiles.addEventListener('needs-update', this.hooks.redraw);
    tiles.addEventListener('needs-render', this.hooks.redraw);
    tiles.addEventListener('tiles-load-end', () => this.sample());
    tiles.addEventListener('load-model', ({ scene }) => behindOverlays(scene));
    tiles.addEventListener('tile-visibility-change', (event) => this.credit(event as unknown as TileEvent));
    this.group.add(tiles.group);
    this.tiles = tiles;

    return true;
  }

  private aimProbe(): void {
    const { tiles, origin, probe } = this;

    if (!tiles || !origin) return;

    if (origin.altitudeM !== null) {
      tiles.deleteCamera(probe);

      return;
    }

    probe.position.set(0, PROBE_HEIGHT_MM, 0);
    probe.up.set(0, 0, -1);
    probe.lookAt(0, 0, 0);
    probe.updateMatrixWorld();
    tiles.setCamera(probe);
    tiles.setResolution(probe, PROBE_PX, PROBE_PX);
  }

  private place(): void {
    const { origin } = this;

    if (!origin) return;

    const ground = origin.altitudeM ?? this.surfaceM;

    this.group.matrix.copy(earthFrame(origin.lat, origin.lon, (ground ?? 0) + origin.offsetM));
    this.group.matrixWorldNeedsUpdate = true;
    this.show(ground !== null);
  }

  private show(visible: boolean): void {
    this.group.visible = visible;
    this.hooks.attribution(visible ? this.attribution() : '');
    this.hooks.redraw();
  }

  private sample(): void {
    const { tiles, origin } = this;

    if (!tiles || !origin || origin.altitudeM !== null) return;

    const raycaster = new THREE.Raycaster();

    this.group.updateMatrixWorld(true);

    const toWorld = tiles.group.matrixWorld;

    raycaster.ray.copy(downRay(origin.lat, origin.lon, PROBE_ABOVE_M)).applyMatrix4(toWorld);
    raycaster.far = Infinity;

    const hit = raycaster.intersectObject(tiles.group, true)[0];

    if (!hit) return;

    const surface = heightOf(hit.point.applyMatrix4(toWorld.clone().invert()));

    if (this.surfaceM !== null && Math.abs(surface - this.surfaceM) < SURFACE_STEP_M) return;

    this.surfaceM = surface;
    this.place();
  }

  private credit({ tile, visible }: TileEvent): void {
    const line = tile.engineData.metadata?.asset?.copyright ?? '';
    const before = this.attribution();

    for (const credit of line.split(';').map((c) => c.trim())) {
      if (!credit) continue;

      const count = (this.credits.get(credit) ?? 0) + (visible ? 1 : -1);

      if (count > 0) this.credits.set(credit, count);
      else this.credits.delete(credit);
    }

    const after = this.attribution();

    if (after !== before && this.group.visible) this.hooks.attribution(after);
  }

  private attribution(): string {
    return [...this.credits]
      .sort((a, b) => b[1] - a[1])
      .map(([credit]) => credit)
      .join('; ');
  }

  private tileCenter(tile: unknown): THREE.Vector3 {
    const sphere = new THREE.Sphere();

    (tile as BoundedTile).engineData.boundingVolume?.getSphere(sphere);

    return sphere.center.applyMatrix4(this.tiles?.group.matrixWorld ?? new THREE.Matrix4());
  }

  private rootCenter(): [number, number, number] | null {
    const root = this.tiles?.root;

    if (!root) return null;

    this.group.updateMatrixWorld(true);

    return this.tileCenter(root).toArray();
  }
}
