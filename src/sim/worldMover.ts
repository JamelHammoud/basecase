import type { MainModule } from '@mujoco/mujoco';
import * as THREE from 'three';
import type { SimEngine } from './engine';
import { quatToMj, toMj } from './mjcfFrames';
import type { MovableBody } from './mjcfTypes';
import type { RecordedWorldChange, WorldChange, WorldLook, WorldLooks } from './worldLooks';

const D2R = Math.PI / 180;

interface Moving {
  spec: MovableBody;
  body: number;
  mocap: number;
  qpos: number;
  dof: number;
  geom: number;
  contype: number;
  conaffinity: number;
  rest: THREE.Quaternion;
}

const eulerQuat = (rotation: readonly number[]) =>
  new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation[0] * D2R, rotation[1] * D2R, rotation[2] * D2R));

export class WorldMover {
  private readonly mj: MainModule;
  private readonly engine: SimEngine;
  private readonly items = new Map<string, Moving>();
  private readonly given = new Map<string, WorldChange>();
  private shown = new Map<string, WorldLook>();
  private changes = 0;

  constructor(mj: MainModule, engine: SimEngine) {
    this.mj = mj;
    this.engine = engine;

    const { model } = engine;
    const id = (type: number, name: string) => mj.mj_name2id(model, type, name);
    const [BODY, GEOM] = [mj.mjtObj.mjOBJ_BODY.value, mj.mjtObj.mjOBJ_GEOM.value];

    for (const spec of engine.sim.movable ?? []) {
      const body = id(BODY, spec.body);
      const joint = body < 0 ? -1 : model.body_jntadr[body];
      const geom = id(GEOM, spec.geom);

      if (body < 0 || geom < 0) continue;

      this.items.set(spec.id, {
        spec,
        body,
        mocap: model.body_mocapid[body],
        qpos: joint >= 0 ? model.jnt_qposadr[joint] : -1,
        dof: joint >= 0 ? model.jnt_dofadr[joint] : -1,
        geom,
        contype: model.geom_contype[geom],
        conaffinity: model.geom_conaffinity[geom],
        rest: eulerQuat(spec.rotation),
      });
    }

    this.resetLooks();
  }

  get version(): number {
    return this.changes;
  }

  has(id: string): boolean {
    return this.items.has(id);
  }

  looks(): WorldLooks {
    return Object.fromEntries(this.shown);
  }

  current(): WorldChange[] {
    return [...this.given.values()].map((c) => structuredClone(c));
  }

  apply(change: WorldChange): boolean {
    const item = this.items.get(change.id);

    if (!item) return false;

    if (change.position || change.rotation) this.place(item, change);

    if (change.visible !== undefined) this.setVisible(item, change.visible);

    const look = this.shown.get(change.id)!;

    this.shown.set(change.id, {
      visible: change.visible ?? look.visible,
      color: change.color ?? look.color,
    });
    this.given.set(change.id, { ...this.given.get(change.id), ...structuredClone(change) });
    this.changes++;
    this.mj.mj_forward(this.engine.model, this.engine.data);

    return true;
  }

  replay(changes: readonly RecordedWorldChange[], until: number) {
    this.reset();

    for (const c of changes) if (c.at <= until + 1e-9) this.apply(c.change);
  }

  reset() {
    const { model, data } = this.engine;

    for (const item of this.items.values()) {
      model.geom_contype[item.geom] = item.contype;
      model.geom_conaffinity[item.geom] = item.conaffinity;
      model.body_gravcomp[item.body] = 0;

      if (item.mocap < 0) continue;

      data.mocap_pos.set(model.body_pos.subarray(item.body * 3, item.body * 3 + 3), item.mocap * 3);
      data.mocap_quat.set(model.body_quat.subarray(item.body * 4, item.body * 4 + 4), item.mocap * 4);
    }

    this.given.clear();
    this.resetLooks();
    this.changes++;
    this.mj.mj_forward(model, data);
  }

  private resetLooks() {
    this.shown = new Map([...this.items.values()].map((m) => [m.spec.id, { visible: true, color: m.spec.color }]));
  }

  private place(item: Moving, change: WorldChange) {
    const { data } = this.engine;
    const free = item.qpos >= 0;
    const pos = free ? data.qpos : data.mocap_pos;
    const quat = free ? data.qpos : data.mocap_quat;
    const posAt = free ? item.qpos : item.mocap * 3;
    const quatAt = free ? item.qpos + 3 : item.mocap * 4;

    if (!free && item.mocap < 0) return;

    if (change.position) pos.set(toMj(change.position), posAt);

    if (change.rotation) quat.set(quatToMj(eulerQuat(change.rotation).multiply(item.rest.clone().invert())), quatAt);

    if (free) data.qvel.fill(0, item.dof, item.dof + 6);
  }

  private setVisible(item: Moving, visible: boolean) {
    const { model, data } = this.engine;

    model.geom_contype[item.geom] = visible ? item.contype : 0;
    model.geom_conaffinity[item.geom] = visible ? item.conaffinity : 0;

    if (item.dof < 0) return;

    model.body_gravcomp[item.body] = visible ? 0 : 1;
    data.qvel.fill(0, item.dof, item.dof + 6);
  }
}
