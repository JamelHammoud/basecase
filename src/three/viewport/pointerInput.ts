import type * as THREE from 'three';
import type { MeasureTool } from './measureTool';
import { floorPoint, hitPartId, rayAt, raycastParts } from './picking';
import { SculptInput } from './sculptInput';
import type { Vec3 } from './types';
import type { ViewportContext } from './viewportContext';

const CLICK_SLOP = 5;

export interface GizmoState {
  dragging: () => boolean;
  hoveringAxis: () => boolean;
}

const additive = (e: MouseEvent) => e.shiftKey || e.metaKey;

const toVec3 = (v: THREE.Vector3): Vec3 => [v.x, v.y, v.z];

export class PointerInput {
  private down = { x: 0, y: 0 };

  private readonly sculpt: SculptInput;

  private readonly ctx: ViewportContext;

  private readonly gizmo: GizmoState;

  private readonly measure: MeasureTool;

  constructor(ctx: ViewportContext, gizmo: GizmoState, measure: MeasureTool) {
    this.ctx = ctx;
    this.gizmo = gizmo;
    this.measure = measure;
    this.sculpt = new SculptInput(ctx);
  }

  install(): () => void {
    const canvas = this.ctx.stage.renderer.domElement;
    const listeners: Array<[string, (e: never) => void]> = [
      ['pointerdown', (e: PointerEvent) => this.onDown(e)],
      ['pointermove', (e: PointerEvent) => this.onMove(e)],
      ['pointerup', (e: PointerEvent) => this.onUp(e)],
      ['dblclick', (e: MouseEvent) => this.onDoubleClick(e)],
      ['pointerleave', () => this.measure.leave()],
    ];

    listeners.forEach(([type, fn]) => canvas.addEventListener(type, fn as EventListener));

    return () => listeners.forEach(([type, fn]) => canvas.removeEventListener(type, fn as EventListener));
  }

  private moved(e: MouseEvent): boolean {
    return Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > CLICK_SLOP;
  }

  private onDown(e: PointerEvent): void {
    const { annotateMode, measureMode, markMode, transformMode } = this.ctx.props();

    this.down = { x: e.clientX, y: e.clientY };

    if (!annotateMode && !measureMode && !markMode && transformMode === 'sculpt' && e.button === 0)
      this.sculpt.begin(e);
  }

  private onMove(e: PointerEvent): void {
    const cursor = this.ctx.stage.brushCursor;

    if (this.ctx.props().measureMode) {
      this.measure.hoverAt(e.clientX, e.clientY);

      return;
    }

    if (this.ctx.props().transformMode === 'sculpt') {
      this.sculpt.hover(e);

      return;
    }

    if (!cursor.visible) {
      return;
    }

    cursor.visible = false;
    this.ctx.loop.invalidate();
  }

  private onUp(e: PointerEvent): void {
    if (this.sculpt.active) {
      this.sculpt.end();

      return;
    }

    if (this.gizmo.dragging() || e.button !== 0 || this.moved(e) || this.ctx.props().markMode) {
      return;
    }

    if (this.ctx.props().measureMode) {
      this.measureClick(e);

      return;
    }

    if (this.ctx.props().annotateMode) {
      this.placeAnnotation(e);

      return;
    }

    this.select(e);
  }

  private measureClick(e: PointerEvent): void {
    if (!e.ctrlKey) this.measure.clickAt(e.clientX, e.clientY);
  }

  private placeAnnotation(e: PointerEvent): void {
    const { stage } = this.ctx;
    const place = this.ctx.props().onPlaceAnnotation;
    const hit = raycastParts(stage, e.clientX, e.clientY);

    if (hit) {
      place?.(toVec3(hit.point), hitPartId(hit));

      return;
    }

    const floor = floorPoint(rayAt(stage, e.clientX, e.clientY));

    if (floor) place?.([floor.x, 0, floor.z], null);
  }

  private select(e: PointerEvent): void {
    const { onSelectPart } = this.ctx.props();
    const partId = hitPartId(raycastParts(this.ctx.stage, e.clientX, e.clientY));

    if (partId) {
      onSelectPart(partId, additive(e));

      return;
    }

    if (!additive(e)) onSelectPart(null);
  }

  private onDoubleClick(e: MouseEvent): void {
    const { annotateMode, measureMode, markMode, transformMode, onSelectPart } = this.ctx.props();
    const blocked = annotateMode || measureMode || markMode || transformMode === 'sculpt' || this.gizmo.hoveringAxis();

    if (e.button !== 0 || additive(e) || blocked || this.moved(e)) {
      return;
    }

    const partId = hitPartId(raycastParts(this.ctx.stage, e.clientX, e.clientY));

    if (partId) onSelectPart(partId, false, true);
  }
}
