import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { THEME_COLORS } from '../../design-system/theme';
import { roundedUpdate } from './transformRounding';
import type { ViewportContext } from './viewportContext';

interface PivotStart {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
  items: Array<{ id: string; obj: THREE.Object3D; position: THREE.Vector3; quaternion: THREE.Quaternion }>;
}

const namedObject = (name: string) => {
  const object = new THREE.Object3D();

  object.name = name;

  return object;
};

export class Gizmo {
  readonly controls: TransformControls;

  readonly pivot = namedObject('selection-pivot');

  readonly jointPivot = namedObject('joint-pivot');

  readonly hand = namedObject('sim-hand');

  private poseDrag: { quaternion: THREE.Quaternion; position: THREE.Vector3 } | null = null;

  private handStart: { quaternion: THREE.Quaternion; ids: string[] } | null = null;

  private pivotStart: PivotStart | null = null;

  private readonly ctx: ViewportContext;

  constructor(ctx: ViewportContext) {
    this.ctx = ctx;

    const { scene, camera, renderer } = ctx.stage;

    this.controls = new TransformControls(camera, renderer.domElement);
    this.controls.setSize(0.95);
    this.controls.setColors(THEME_COLORS.axisX, THEME_COLORS.axisY, THEME_COLORS.axisZ, THEME_COLORS.gizmoActive);
    scene.add(this.controls.getHelper(), this.pivot, this.jointPivot, this.hand);
    this.controls.addEventListener('mouseDown', () => this.onDown());
    this.controls.addEventListener('objectChange', () => this.onChange());
    this.controls.addEventListener('mouseUp', () => this.onUp());
    this.controls.addEventListener('dragging-changed', (event) => this.onDraggingChanged(Boolean(event.value)));
    this.controls.addEventListener('change', ctx.loop.invalidate);
  }

  dispose(): void {
    this.controls.dispose();
  }

  get draggedObject(): THREE.Object3D | null {
    return this.controls.dragging ? (this.controls.object ?? null) : null;
  }

  applySnaps(): void {
    const free = this.ctx.runtime.shiftHeld;
    const { snapStepMm, snapAngleDeg, transformMode } = this.ctx.props();
    const posing = transformMode === 'pose';
    const step = posing ? 1 : snapStepMm;
    const angle = posing ? 1 : snapAngleDeg;

    this.controls.setTranslationSnap(!free && snapStepMm > 0 ? step : null);
    this.controls.setRotationSnap(!free && snapAngleDeg > 0 ? THREE.MathUtils.degToRad(angle) : null);
    this.controls.setScaleSnap(free ? null : 0.05);
    this.ctx.ui.setSnapBypassed(free && this.ctx.runtime.draggingGizmo);
  }

  refresh(): void {
    const { transformMode, measureMode, markMode } = this.ctx.props();

    this.ctx.stage.brushCursor.visible = false;

    if (transformMode === 'sculpt' || measureMode || markMode) {
      this.controls.detach();
    } else if (transformMode === 'pose') {
      this.attachJoint();
    } else {
      this.controls.setMode(transformMode);
      this.applySnaps();
      this.attachSelection();
    }

    this.ctx.loop.invalidate();
  }

  placeHand(): void {
    const box = new THREE.Box3();

    for (const id of this.ctx.props().selectedPartIds) {
      const obj = this.ctx.layer.get(id);

      if (obj) box.expandByObject(obj);
    }

    if (!box.isEmpty()) box.getCenter(this.hand.position);

    this.hand.updateMatrixWorld(true);
  }

  syncHandToPose(): void {
    const tc = this.controls;

    if (this.ctx.props().onGrab && tc.object === this.hand && !tc.dragging) this.placeHand();
  }

  private attachJoint(): void {
    const joint = this.ctx.props().poseJoint;
    const tc = this.controls;

    if (!joint) {
      tc.detach();

      return;
    }

    if (this.poseDrag) {
      return;
    }

    const free = this.ctx.runtime.shiftHeld;

    this.jointPivot.position.copy(joint.origin);
    this.jointPivot.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), joint.axis.clone().normalize());
    this.jointPivot.updateMatrixWorld(true);
    tc.setMode(joint.type === 'prismatic' ? 'translate' : 'rotate');
    tc.setSpace('local');
    tc.showX = true;
    tc.showY = false;
    tc.showZ = false;
    tc.setRotationSnap(free ? null : THREE.MathUtils.degToRad(1));
    tc.setTranslationSnap(free ? null : 1);

    if (tc.object !== this.jointPivot) tc.attach(this.jointPivot);
  }

  private movableSelection() {
    const { selectedPartIds } = this.ctx.props();

    return selectedPartIds.flatMap((id) => {
      const obj = this.ctx.layer.get(id);
      const part = this.ctx.layer.part(id);

      return obj && part && !part.locked ? [{ id, obj }] : [];
    });
  }

  private attachHand(movable: number): void {
    const tc = this.controls;

    if (!movable || tc.getMode() === 'scale') {
      tc.detach();

      return;
    }

    if (!tc.dragging) {
      this.hand.quaternion.identity();
      this.placeHand();
    }

    if (tc.object !== this.hand) tc.attach(this.hand);
  }

  private attachSelection(): void {
    const tc = this.controls;
    const movable = this.movableSelection();

    tc.showX = tc.showY = tc.showZ = true;
    tc.setSpace('world');

    if (this.ctx.props().onGrab) {
      this.attachHand(movable.length);

      return;
    }

    if (movable.length === 0) {
      tc.detach();

      return;
    }

    if (movable.length === 1 && this.ctx.props().selectedPartIds.length === 1) {
      tc.attach(movable[0].obj);

      return;
    }

    const box = new THREE.Box3();

    movable.forEach((m) => box.expandByObject(m.obj));
    box.getCenter(this.pivot.position);
    this.pivot.quaternion.identity();
    this.pivot.scale.set(1, 1, 1);
    tc.attach(this.pivot);
  }

  private jointDelta(): number {
    const start = this.poseDrag;
    const joint = this.ctx.props().poseJoint;

    if (!start || !joint) {
      return 0;
    }

    if (joint.type === 'prismatic') {
      return this.jointPivot.position.clone().sub(start.position).dot(joint.axis.clone().normalize());
    }

    const rel = start.quaternion.clone().invert().multiply(this.jointPivot.quaternion);

    return THREE.MathUtils.radToDeg(2 * Math.atan2(rel.x, rel.w));
  }

  private onDown(): void {
    const object = this.controls.object;
    const { poseJoint, onPoseJoint, onGrab, selectedPartIds } = this.ctx.props();

    if (object === this.jointPivot && poseJoint) {
      this.poseDrag = { quaternion: this.jointPivot.quaternion.clone(), position: this.jointPivot.position.clone() };
      onPoseJoint?.(poseJoint.id, 0, 'start');
    }

    if (object === this.hand && onGrab) {
      this.handStart = { quaternion: this.hand.quaternion.clone(), ids: [...selectedPartIds] };
      onGrab(this.handStart.ids, { position: this.hand.position.clone(), turn: null }, 'start');
    }

    if (object === this.pivot) this.pivotStart = this.capturePivot();
  }

  private capturePivot(): PivotStart {
    return {
      position: this.pivot.position.clone(),
      quaternion: this.pivot.quaternion.clone(),
      scale: this.pivot.scale.clone(),
      items: this.movableSelection().map(({ id, obj }) => ({
        id,
        obj,
        position: obj.position.clone(),
        quaternion: obj.quaternion.clone(),
      })),
    };
  }

  private onChange(): void {
    const object = this.controls.object;
    const { poseJoint, onPoseJoint } = this.ctx.props();

    if (object === this.jointPivot && poseJoint && this.poseDrag)
      onPoseJoint?.(poseJoint.id, this.jointDelta(), 'move');

    if (object === this.hand) this.moveHand();

    if (object === this.pivot) this.movePivotItems();
  }

  private moveHand(): void {
    const grab = this.ctx.props().onGrab;

    if (!grab || !this.handStart) {
      return;
    }

    this.hand.scale.set(1, 1, 1);

    const turn =
      this.controls.getMode() === 'rotate'
        ? this.hand.quaternion.clone().multiply(this.handStart.quaternion.clone().invert())
        : null;

    grab(this.handStart.ids, { position: this.hand.position.clone(), turn }, 'move');
  }

  private movePivotItems(): void {
    const start = this.pivotStart;

    if (!start) {
      return;
    }

    const dq = this.pivot.quaternion.clone().multiply(start.quaternion.clone().invert());
    const ds = new THREE.Vector3().copy(this.pivot.scale).divide(start.scale);

    for (const item of start.items) {
      const offset = item.position.clone().sub(start.position).multiply(ds).applyQuaternion(dq);

      item.obj.position.copy(this.pivot.position).add(offset);
      item.obj.quaternion.copy(dq).multiply(item.quaternion);
      item.obj.scale.copy(ds);
    }
  }

  private onUp(): void {
    const object = this.controls.object;
    const { poseJoint, onPoseJoint, onGrab } = this.ctx.props();

    if (object === this.jointPivot && poseJoint && this.poseDrag) {
      onPoseJoint?.(poseJoint.id, this.jointDelta(), 'end');
      this.poseDrag = null;
    }

    if (object === this.hand && this.handStart) this.releaseHand(onGrab);

    if (object === this.pivot && this.pivotStart) this.commitPivot();
  }

  private releaseHand(onGrab: ReturnType<ViewportContext['props']>['onGrab']): void {
    onGrab?.(this.handStart!.ids, null, 'end');
    this.handStart = null;
    this.hand.quaternion.identity();
    this.hand.scale.set(1, 1, 1);
    this.placeHand();
  }

  private commitPivot(): void {
    const start = this.pivotStart!;
    const scaled = this.controls.getMode() === 'scale';
    const free = this.ctx.runtime.shiftHeld;

    this.pivotStart = null;

    const updates = start.items.flatMap((item) => {
      const part = this.ctx.layer.part(item.id);

      if (!part) return [];

      const rest = this.ctx.layer.toRest(item.id, item.obj.position, item.obj.quaternion);

      return [roundedUpdate(part, rest, { free, scale: scaled ? item.obj.scale : null })];
    });

    this.ctx.props().onUpdatePartsTransform?.(updates);
  }

  private onDraggingChanged(dragging: boolean): void {
    this.ctx.runtime.draggingGizmo = dragging;
    this.ctx.stage.orbit.enabled = !dragging;
    this.ctx.ui.setSnapBypassed(dragging && this.ctx.runtime.shiftHeld);

    const object = this.controls.object;

    if (dragging || !object || object === this.jointPivot) {
      return;
    }

    this.commitSingle(object);
  }

  private commitSingle(object: THREE.Object3D): void {
    const partId = object.userData.partId as string | undefined;
    const part = partId ? this.ctx.layer.part(partId) : undefined;

    if (!part) {
      return;
    }

    const scaled = this.controls.getMode() === 'scale';
    const rest = this.ctx.layer.toRest(part.id, object.position, object.quaternion);
    const update = roundedUpdate(part, rest, { free: this.ctx.runtime.shiftHeld, scale: scaled ? object.scale : null });

    if (update.dimensions) object.scale.set(1, 1, 1);

    this.ctx.props().onUpdatePartTransform(part.id, update.position, update.rotation, update.dimensions);
  }
}
