import * as THREE from 'three';
import { convertScenePartToSculptMesh } from '../buildPartMesh';
import {
  sculptStroke,
  buildBufferGeometryFromSculptData,
  extractSculptDataFromGeometry,
} from '../sculptAndBooleanEngine';
import type { ScenePart } from '../../types/robotics';
import { raycastParts } from './picking';
import type { ViewportContext } from './viewportContext';

interface ActiveStroke {
  partId: string;
  mesh: THREE.Mesh;
  size: [number, number, number];
  lastLocalHit: THREE.Vector3;
}

const UP = new THREE.Vector3(0, 1, 0);

export class SculptInput {
  private stroke: ActiveStroke | null = null;

  private readonly ctx: ViewportContext;

  constructor(ctx: ViewportContext) {
    this.ctx = ctx;
  }

  get active(): boolean {
    return this.stroke !== null;
  }

  begin(e: PointerEvent): void {
    const hit = raycastParts(this.ctx.stage, e.clientX, e.clientY);

    if (!(hit?.object instanceof THREE.Mesh)) {
      return;
    }

    const part = this.ctx.layer.part(hit.object.userData.partId as string);

    if (!part || part.locked) {
      return;
    }

    const props = this.ctx.props();

    if (props.selectedPartIds[0] !== part.id) props.onSelectPart(part.id);

    this.ctx.stage.orbit.enabled = false;

    const mesh = this.sculptTarget(hit.object, part);
    const localHit = mesh.worldToLocal(hit.point.clone());
    const normal = hit.face ? hit.face.normal.clone() : UP.clone();

    sculptStroke({
      geo: mesh.geometry,
      localHitPoint: localHit,
      localHitNormal: normal,
      dragDeltaLocal: new THREE.Vector3(),
      settings: props.sculptSettings,
      invertBrush: e.altKey,
    });
    this.stroke = {
      partId: part.id,
      mesh,
      size: [part.dimensions.width, part.dimensions.height, part.dimensions.depth],
      lastLocalHit: localHit,
    };
    this.ctx.loop.invalidate();
  }

  hover(e: PointerEvent): void {
    const cursor = this.ctx.stage.brushCursor;
    const hit = raycastParts(this.ctx.stage, e.clientX, e.clientY);

    this.ctx.loop.invalidate();

    if (!(hit?.object instanceof THREE.Mesh)) {
      cursor.visible = false;

      return;
    }

    const radius = this.ctx.props().sculptSettings.radiusMm;

    cursor.visible = true;
    cursor.position.copy(hit.point);
    cursor.scale.set(radius, radius, radius);

    if (hit.face) {
      const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();

      cursor.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    }

    this.drag(hit, e.altKey);
  }

  end(): void {
    const stroke = this.stroke;

    this.stroke = null;
    this.ctx.stage.orbit.enabled = true;

    if (!stroke) {
      return;
    }

    const data = extractSculptDataFromGeometry(stroke.mesh.geometry, ...stroke.size);

    this.ctx.props().onCommitSculptMesh(stroke.partId, data);
  }

  private drag(hit: THREE.Intersection, invert: boolean): void {
    const stroke = this.stroke;

    if (!stroke) {
      return;
    }

    const localHit = stroke.mesh.worldToLocal(hit.point.clone());
    const delta = localHit.clone().sub(stroke.lastLocalHit);
    const normal = hit.face ? hit.face.normal.clone() : UP.clone();

    sculptStroke({
      geo: stroke.mesh.geometry,
      localHitPoint: localHit,
      localHitNormal: normal,
      dragDeltaLocal: delta,
      settings: this.ctx.props().sculptSettings,
      invertBrush: invert,
    });
    stroke.lastLocalHit.copy(localHit);
  }

  private sculptTarget(hitMesh: THREE.Mesh, part: ScenePart): THREE.Mesh {
    if (hitMesh.userData.isSculptTarget) {
      hitMesh.getObjectByName('cad-edges')?.removeFromParent();

      return hitMesh;
    }

    const { width, height, depth } = part.dimensions;
    const geometry = buildBufferGeometryFromSculptData(convertScenePartToSculptMesh(part), width, height, depth);
    const mesh = new THREE.Mesh(geometry, (hitMesh.material as THREE.Material).clone());

    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.partId = part.id;
    mesh.userData.isSculptTarget = true;
    this.ctx.layer.replaceContents(part.id, (group) => group.add(mesh));

    return mesh;
  }
}
