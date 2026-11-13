import type { MainModule } from '@mujoco/mujoco';
import * as THREE from 'three';
import { worldRefusal, type WorldChange, type WorldEvent, type WorldLooks, type WorldPose } from '../cases/worldSet';
import type { V3 } from '../utils/kinematics';
import type { SimEngine } from './engine';
import { quatToMj, toMj } from './mjcfFrames';

interface Mover {
  id: string;
  kind: 'mocap' | 'free';
  body: number;
  mocap: number;
  qpos: number;
  dof: number;
  geoms: number[];
  contype: number[];
  conaffinity: number[];
  rest: THREE.Quaternion;
}

const turnOf = (rotation: V3) =>
  new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rotation.map(THREE.MathUtils.degToRad) as V3), 'XYZ'));

const rgbaOf = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

export class WorldMoves {
  private readonly mj: MainModule;
  private readonly engine: SimEngine;
  private readonly movers = new Map<string, Mover>();
  private readonly objects: Array<{ id: string; movable: boolean }> = [];
  private readonly placed = new Map<string, WorldPose>();
  private readonly hiddenAt = new Map<string, Float64Array>();
  private shown: WorldLooks = {};
  private version = 0;

  constructor(mj: MainModule, engine: SimEngine) {
    this.mj = mj;
    this.engine = engine;

    const { model } = engine;
    const BODY = mj.mjtObj.mjOBJ_BODY.value;

    for (const b of engine.sim.bodies) {
      for (const id of b.world ?? []) this.objects.push({ id, movable: !!b.moves });

      const id = b.world?.[0];

      if (!b.moves || !id) continue;

      const body = mj.mj_name2id(model, BODY, b.name);
      const joint = model.body_jntadr[body];
      const geoms = Array.from({ length: model.body_geomnum[body] }, (_, k) => model.body_geomadr[body] + k);

      this.movers.set(id, {
        id,
        kind: b.moves.kind,
        body,
        mocap: model.body_mocapid[body],
        qpos: joint >= 0 ? model.jnt_qposadr[joint] : -1,
        dof: joint >= 0 ? model.jnt_dofadr[joint] : -1,
        geoms,
        contype: geoms.map((g) => model.geom_contype[g]),
        conaffinity: geoms.map((g) => model.geom_conaffinity[g]),
        rest: turnOf(b.moves.rotation),
      });
    }
  }

  get looksVersion(): number {
    return this.version;
  }

  looks(): WorldLooks {
    return this.shown;
  }

  apply(change: WorldChange, options: { teleport?: boolean } = {}): string | null {
    const refusal = worldRefusal(this.objects, change.id);
    const mover = this.movers.get(change.id);

    if (refusal || !mover) return refusal ?? `${change.id} isn’t movable`;

    if (change.pose) this.place(mover, change.pose, options.teleport !== false);

    if (change.visible !== undefined) this.show(mover, change.visible, options.teleport !== false && !change.pose);

    if (change.color !== undefined) this.paint(mover, change.color);

    this.mj.mj_kinematics(this.engine.model, this.engine.data);

    return null;
  }

  state(): WorldChange[] {
    return [...this.movers.keys()].flatMap((id) => {
      const pose = this.placed.get(id);
      const look = this.shown[id];

      return pose || look ? [{ id, ...(pose ? { pose } : {}), ...look }] : [];
    });
  }

  reset() {
    const { model, data } = this.engine;

    for (const m of this.movers.values()) {
      m.geoms.forEach((g, k) => {
        model.geom_contype[g] = m.contype[k];
        model.geom_conaffinity[g] = m.conaffinity[k];
      });

      if (m.mocap < 0) continue;

      data.mocap_pos.set(model.body_pos.subarray(m.body * 3, m.body * 3 + 3), m.mocap * 3);
      data.mocap_quat.set(model.body_quat.subarray(m.body * 4, m.body * 4 + 4), m.mocap * 4);
    }

    this.placed.clear();
    this.hiddenAt.clear();

    if (Object.keys(this.shown).length) this.version++;

    this.shown = {};
    this.mj.mj_kinematics(model, data);
  }

  replay(events: readonly WorldEvent[], until: number) {
    this.reset();

    for (const e of events) if (e.at <= until + 1e-9) this.apply(e, { teleport: false });
  }

  private place(m: Mover, pose: WorldPose, teleport: boolean) {
    this.placed.set(m.id, { ...this.placed.get(m.id), ...pose });

    const turn = pose.rotation ? quatToMj(turnOf(pose.rotation).multiply(m.rest.clone().invert())) : null;
    const into =
      m.kind === 'mocap'
        ? { pos: this.engine.data.mocap_pos, at: m.mocap * 3, quat: this.engine.data.mocap_quat, turnAt: m.mocap * 4 }
        : { pos: this.engine.data.qpos, at: m.qpos, quat: this.engine.data.qpos, turnAt: m.qpos + 3 };

    if (m.kind === 'free' && !teleport) return;

    if (pose.position) into.pos.set(toMj(pose.position), into.at);

    if (turn) into.quat.set(turn, into.turnAt);

    if (m.kind === 'free') this.engine.data.qvel.fill(0, m.dof, m.dof + 6);
  }

  private show(m: Mover, visible: boolean, restore: boolean) {
    const { model, data } = this.engine;

    m.geoms.forEach((g, k) => {
      model.geom_contype[g] = visible ? m.contype[k] : 0;
      model.geom_conaffinity[g] = visible ? m.conaffinity[k] : 0;
    });
    this.look(m.id, { visible });

    if (m.kind !== 'free') return;

    if (!visible) this.hiddenAt.set(m.id, Float64Array.from(data.qpos.subarray(m.qpos, m.qpos + 7)));

    const held = this.hiddenAt.get(m.id);

    if (visible && restore && held) data.qpos.set(held, m.qpos);

    if (visible) this.hiddenAt.delete(m.id);

    data.qvel.fill(0, m.dof, m.dof + 6);
  }

  private paint(m: Mover, color: string) {
    const [r, g, b] = rgbaOf(color);

    for (const geom of m.geoms) this.engine.model.geom_rgba.set([r, g, b], geom * 4);

    this.look(m.id, { color });
  }

  private look(id: string, look: WorldLooks[string]) {
    const merged = { ...this.shown[id], ...look };
    const next = { ...this.shown };

    if (merged.visible === true) delete merged.visible;

    if (Object.keys(merged).length) next[id] = merged;
    else delete next[id];

    this.shown = next;
    this.version++;
  }
}
