import * as THREE from 'three';
import type { V3 } from '../../agent/agentFrame';
import { nearbyPorts, portsAt, snapPart, snapTargets, SNAP_MM, type PortAt, type Snap } from '../../agent/snap';
import type { ScenePart } from '../../types/robotics';
import { applyPartTransform } from '../buildPartMesh';
import { PortDots, type PortDot } from './portDots';
import type { ViewportContext } from './viewportContext';

const REACH_AT_MM = 400;
const SHOW_MM = 60;

interface Session {
  part: ScenePart;
  targets: PortAt[];
  raw: THREE.Vector3;
  snap: Snap | null;
}

interface DropTargets {
  parts: ScenePart[];
  id: string;
  targets: PortAt[];
}

const hotTarget = (snap: Snap | null, p: PortAt) =>
  !!snap && p.part === snap.pair.target && p.port.name === snap.pair.targetPort;

export class PortSnap {
  private session: Session | null = null;

  private drop: DropTargets | null = null;

  private readonly dots: PortDots;

  private readonly ctx: ViewportContext;

  constructor(ctx: ViewportContext) {
    this.ctx = ctx;
    this.dots = new PortDots(ctx.stage.overlays, () => ctx.stage.renderer.getPixelRatio());
  }

  dispose(): void {
    this.dots.dispose();
  }

  reachMm(): number {
    const { camera, orbit } = this.ctx.stage;

    return SNAP_MM * Math.max(1, camera.position.distanceTo(orbit.target) / REACH_AT_MM);
  }

  begin(id: string): void {
    const part = this.ctx.layer.part(id);

    this.session = null;

    if (!part || this.ctx.layer.pose.size || !portsAt(part).length) return;

    const targets = snapTargets(this.ctx.props().parts, id);

    if (targets.length) this.session = { part, targets, raw: new THREE.Vector3(...part.position), snap: null };
  }

  move(object: THREE.Object3D): void {
    const s = this.session;

    if (!s) return;

    s.raw.copy(object.position);
    this.place(object, s);
  }

  resnap(object: THREE.Object3D | null): void {
    if (object && this.session) this.place(object, this.session);
  }

  snapped(): boolean {
    return !!this.session?.snap;
  }

  end(): Snap | null {
    const snap = this.session?.snap ?? null;

    this.session = null;
    this.dots.hide();
    this.ctx.loop.invalidate();

    return snap;
  }

  preview(mover: ScenePart | null, free: boolean): Snap | null {
    if (!mover) {
      this.drop = null;
      this.dots.hide();
      this.ctx.loop.invalidate();

      return null;
    }

    const targets = this.dropTargets(mover.id);
    const snap = this.solve(mover, targets, free);

    this.ctx.loop.invalidate();

    return snap;
  }

  private dropTargets(id: string): PortAt[] {
    const { parts } = this.ctx.props();

    if (this.drop?.parts !== parts || this.drop.id !== id)
      this.drop = { parts, id, targets: this.ctx.layer.pose.size ? [] : snapTargets(parts, id) };

    return this.drop.targets;
  }

  private place(object: THREE.Object3D, s: Session): void {
    const mover = { ...s.part, position: s.raw.toArray() as V3 };

    s.snap = this.solve(mover, s.targets, this.ctx.runtime.freeHeld);
    applyPartTransform(object, s.snap ? s.snap.placement : mover);
    object.updateMatrixWorld(true);
  }

  private solve(mover: ScenePart, targets: PortAt[], free: boolean): Snap | null {
    const reachMm = this.reachMm();
    const snap = targets.length ? snapPart({ parts: this.ctx.props().parts, mover, reachMm, free, targets }) : null;
    const shown = snap ? { ...mover, ...snap.placement } : mover;
    const size = Math.max(mover.dimensions.width, mover.dimensions.height, mover.dimensions.depth);
    const near = nearbyPorts(portsAt(shown), targets, Math.max(SHOW_MM, size) + reachMm);
    const dots: PortDot[] = [
      ...near.targets.map((p) => ({ at: p.at.position, hot: hotTarget(snap, p) })),
      ...near.mover.map((p) => ({ at: p.at.position, hot: !!snap && p.port.name === snap.pair.port })),
    ];

    this.dots.show(dots);

    return snap;
  }
}
