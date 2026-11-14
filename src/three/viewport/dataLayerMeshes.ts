import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { LayerDraw } from '../../dataLayers/draw';
import type { GridDraw } from '../../dataLayers/grid';
import { pointSink, type PointSink } from '../../dataLayers/pointSink';
import { SHAPE_KINDS, type ShapeKind, type Shapes } from '../../dataLayers/shapes';

export const DATA_ORDER = 1041;

const POINT_PX = 3;
const START_POINTS = 4096;

function arrowGeometry() {
  const shaft = new THREE.CylinderGeometry(0.25, 0.25, 0.7, 12).translate(0, 0.35, 0);
  const head = new THREE.ConeGeometry(0.5, 0.3, 16).translate(0, 0.85, 0);

  return mergeGeometries([shaft, head])!.rotateZ(-Math.PI / 2);
}

const SHAPE_GEOMETRY: Record<ShapeKind, () => THREE.BufferGeometry> = {
  cube: () => new THREE.BoxGeometry(1, 1, 1),
  sphere: () => new THREE.SphereGeometry(0.5, 16, 12),
  cylinder: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 20).rotateX(Math.PI / 2),
  arrow: arrowGeometry,
};

const quiet = <T extends THREE.Object3D>(object: T, order = DATA_ORDER): T => {
  object.renderOrder = order;
  object.frustumCulled = false;
  object.raycast = () => {};

  return object;
};

class PointBuffer {
  readonly object: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;

  sink: PointSink = pointSink(START_POINTS);

  constructor(onTop: boolean) {
    const material = new THREE.PointsMaterial({
      size: POINT_PX,
      sizeAttenuation: false,
      vertexColors: true,
      depthTest: !onTop,
      depthWrite: false,
      toneMapped: false,
    });

    this.object = quiet(new THREE.Points(new THREE.BufferGeometry(), material));
    this.bind();
  }

  grow(capacity: number) {
    this.sink = pointSink(capacity);
    this.object.geometry.dispose();
    this.bind();
  }

  show() {
    const { geometry } = this.object;
    const count = this.sink.count;

    for (const name of ['position', 'color']) {
      const attribute = geometry.getAttribute(name) as THREE.BufferAttribute;

      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, count * 3);
      attribute.needsUpdate = true;
    }

    geometry.setDrawRange(0, count);
    this.object.visible = count > 0;
  }

  private bind() {
    const { geometry } = this.object;

    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.sink.positions, 3).setUsage(THREE.DynamicDrawUsage),
    );
    geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(this.sink.colors, 3, true).setUsage(THREE.DynamicDrawUsage),
    );
    geometry.setDrawRange(0, 0);
  }
}

class ShapeMeshes {
  readonly group = new THREE.Group();

  private readonly meshes = new Map<ShapeKind, THREE.InstancedMesh>();

  private readonly material = new THREE.MeshLambertMaterial({ toneMapped: false });

  private readonly lines = quiet(
    new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ vertexColors: true, toneMapped: false }),
    ),
  );

  constructor() {
    this.group.add(this.lines);
  }

  show(shapes: Shapes) {
    for (const kind of SHAPE_KINDS) this.showKind(kind, shapes[kind]);

    const { geometry } = this.lines;

    if (!shapes.lines.length && !this.lines.visible) return;

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(shapes.lines, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(shapes.lineColors, 3));
    this.lines.visible = shapes.lines.length > 0;
  }

  dispose() {
    for (const mesh of this.meshes.values()) mesh.geometry.dispose();

    this.material.dispose();
    this.lines.geometry.dispose();
    this.lines.material.dispose();
  }

  private showKind(kind: ShapeKind, list: Shapes[ShapeKind]) {
    let mesh = this.meshes.get(kind);

    if (mesh && mesh.instanceMatrix.count < list.length) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      mesh.dispose();
      mesh = undefined;
    }

    if (!mesh && list.length) {
      mesh = quiet(new THREE.InstancedMesh(SHAPE_GEOMETRY[kind](), this.material, Math.max(16, list.length * 2)));
      this.meshes.set(kind, mesh);
      this.group.add(mesh);
    }

    if (!mesh) return;

    const color = new THREE.Color();

    list.forEach((s, i) => {
      mesh.setMatrixAt(i, s.matrix);
      mesh.setColorAt(i, color.setRGB(s.color[0], s.color[1], s.color[2]));
    });
    mesh.count = list.length;
    mesh.instanceMatrix.needsUpdate = true;

    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
}

class GridPlane {
  readonly object = quiet(
    new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).translate(0.5, 0.5, 0),
      new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
    ),
    DATA_ORDER - 1,
  );

  private texture: THREE.DataTexture | null = null;

  show(grid: GridDraw | null) {
    this.object.visible = !!grid;

    if (!grid) return;

    if (!this.texture || this.texture.image.width !== grid.width || this.texture.image.height !== grid.height) {
      this.texture?.dispose();
      this.texture = new THREE.DataTexture(grid.texels, grid.width, grid.height, THREE.RGBAFormat);
      this.texture.magFilter = THREE.NearestFilter;
      this.object.material.map = this.texture;
      this.object.material.needsUpdate = true;
    } else {
      this.texture.image.data = grid.texels;
    }

    this.texture.needsUpdate = true;
    this.object.matrixAutoUpdate = false;
    this.object.matrix.copy(grid.placement);
    this.object.matrixWorldNeedsUpdate = true;
  }

  get texels(): Uint8Array | null {
    return this.texture ? (this.texture.image.data as Uint8Array) : null;
  }

  dispose() {
    this.texture?.dispose();
    this.object.geometry.dispose();
    this.object.material.dispose();
  }
}

export class LayerMeshes {
  readonly group = new THREE.Group();

  readonly points: PointBuffer;

  private readonly shapes = new ShapeMeshes();

  private readonly grid = new GridPlane();

  constructor(onTop: boolean) {
    this.points = new PointBuffer(onTop);
    this.group.add(this.points.object, this.shapes.group, this.grid.object);
  }

  show(draw: LayerDraw) {
    this.points.show();
    this.shapes.show(draw.shapes);
    this.grid.show(draw.grid);
  }

  get gridTexels(): Uint8Array | null {
    return this.grid.object.visible ? this.grid.texels : null;
  }

  dispose() {
    this.group.removeFromParent();
    this.points.object.geometry.dispose();
    this.points.object.material.dispose();
    this.shapes.dispose();
    this.grid.dispose();
  }
}
