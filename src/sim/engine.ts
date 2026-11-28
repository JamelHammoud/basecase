import type { MainModule, MjData, MjModel } from '@mujoco/mujoco';
import type { RobotAnimation, RobotPoseState } from '../types/robotics';
import { loopInitial } from './loopInitial';
import { controlValues, assertTendonController } from './controlValues';
import { primeJointControls } from './primeJointControls';
import { stepControlled } from './controlStep';
import { createDrive, type DriveCommand, type DriveLoop, type DriveSetup } from './drive';
import { PoseDrive, type PoseSetup } from './drivePose';
import { GrabForce } from './grabForce';
import { PushForce, type PushTiming } from './pushForce';
import type { SimModel } from './mjcf';
import type { SimStats } from './engineStats';
import { policyEyes } from './eyes';
import { ActuatorFaults, type FaultKind } from './faults';
import type { PolicySpec } from './policy';
import { createPolicyState, stepPolicy, type PolicyState } from './policyStep';
import { routePolicy, RouteRunner, type RouteController } from './route';
import * as readout from './jointReadout';
import { Scanner } from './scanner';
import { BodyContacts } from './contacts';
import { effectorAt, readEngineStats, robotTilt, type EngineRobot } from './engineReadout';
import { EngineContinuation } from './engineContinuation';
import { TeachingControl, type ActionOwner, type AppliedOwner } from './teaching';
import type { ArmSetup } from './drive';
import { WorldMoves } from './worldMoves';
import { ContactForces, type ForceEvidence } from './contactForces';
import { ForceClosure } from './forceClosure';

export type Controller =
  | { kind: 'hold'; values?: Record<string, number> }
  | { kind: 'animation'; animation: RobotAnimation }
  | { kind: 'policy'; policy: PolicySpec; robot: string; hold?: Record<string, number>; pose?: PoseSetup }
  | { kind: 'drive'; setup: DriveSetup }
  | RouteController
  | { kind: 'limp' };

export type { JointStat, RobotStat, SimStats } from './engineStats';

export class SimEngine {
  readonly model: MjModel;
  readonly data: MjData;
  private bodyIds: number[];
  private contacts: BodyContacts;
  forces: ContactForces | null = null;
  private forceClosure: ForceClosure | null = null;
  private jointQpos: number[];
  private jointDof: number[];
  private robots: EngineRobot[];
  private controller: Controller = { kind: 'hold' };
  private drive: DriveLoop | null = null;
  private arms: PoseDrive | null = null;
  private route: RouteRunner | null = null;
  beforeStepHook: (() => void) | null = null;
  stepHook: (() => void) | null = null;
  continuationHook: (() => void) | null = null;
  commandHook: ((c: DriveCommand) => void) | null = null;
  controlHook: ((owner?: AppliedOwner) => void) | null = null;
  private teaching: TeachingControl | null = null;
  private given = new Map<number, DriveCommand>();
  private peaks: Float64Array;
  private saturated: Float64Array;
  private fellAt = new Map<string, number>();
  private pushes: PushForce;
  private grab: GrabForce;
  private faults: ActuatorFaults;
  private policyState: PolicyState | null = null;
  readonly dt: number;
  readonly scanner: Scanner | null;
  private mj: MainModule;
  readonly sim: SimModel;
  readonly continuation: EngineContinuation;
  readonly world: WorldMoves;

  constructor(mj: MainModule, sim: SimModel) {
    this.mj = mj;
    this.sim = sim;
    this.model = mj.MjModel.from_xml_string(sim.xml);
    this.data = new mj.MjData(this.model);
    this.dt = this.model.opt.timestep;
    this.grab = new GrabForce(this.model, this.data, this.dt);
    this.pushes = new PushForce(this.data);
    this.scanner = Scanner.create(mj, this.model, this.data, sim.scans);
    this.faults = new ActuatorFaults(this.model);

    const id = (type: number, name: string) => mj.mj_name2id(this.model, type, name);
    const [BODY, JOINT] = [mj.mjtObj.mjOBJ_BODY.value, mj.mjtObj.mjOBJ_JOINT.value];

    this.bodyIds = sim.bodies.map((b) => id(BODY, b.name));
    this.contacts = new BodyContacts(this.model, this.bodyIds);

    const jids = sim.joints.map((j) => id(JOINT, j.name));

    this.jointQpos = jids.map((j) => this.model.jnt_qposadr[j]);
    this.jointDof = jids.map((j) => this.model.jnt_dofadr[j]);
    this.robots = sim.robots.map((r) => {
      const root = id(JOINT, r.root);

      return {
        key: r.key,
        rootQpos: root >= 0 ? this.model.jnt_qposadr[root] : -1,
        rootDof: root >= 0 ? this.model.jnt_dofadr[root] : -1,
        rootBody: id(BODY, r.root),
        floating: r.floating,
        joints: r.joints.map((jid) => sim.joints.findIndex((j) => j.id === jid)),
        startZ: 0,
        startXY: [0, 0] as [number, number],
      };
    });
    this.peaks = new Float64Array(sim.joints.length);
    this.saturated = new Float64Array(sim.joints.length);
    this.world = new WorldMoves(mj, this);
    this.continuation = new EngineContinuation({
      mj,
      sim,
      model: this.model,
      data: this.data,
      busy: () => !!this.forces || !!this.scanner || this.pushes.active || this.grab.active || this.world.hasPeople,
      runtime: () => ({
        controller: this.controller,
        drive: this.drive,
        faults: this.faults,
        peaks: this.peaks,
        saturated: this.saturated,
        fellAt: this.fellAt,
        robots: this.robots,
        given: this.given,
      }),
      setController: (controller) => this.setController(controller),
    });
    this.reset();
  }

  reset(initial: RobotPoseState = this.sim.initial) {
    const { mj, model, data } = this;

    initial = loopInitial(this.sim, initial);
    mj.mj_resetData(model, data);
    this.sim.joints.forEach((j, i) => {
      const v = initial.values[j.id];

      if (v !== undefined) data.qpos[this.jointQpos[i]] = readout.jointQposOf(j.type, v);
    });

    for (const r of this.robots) this.placeRoot(r, initial);

    this.world.reset({ forward: false });

    mj.mj_forward(model, data);
    primeJointControls(
      this.mj,
      this,
      this.jointQpos,
      this.sim.joints.map((_, i) => i),
    );

    for (const r of this.robots) {
      r.startZ = data.xpos[r.rootBody * 3 + 2];
      r.startXY = [data.xpos[r.rootBody * 3], data.xpos[r.rootBody * 3 + 1]];
    }

    this.forces?.reset();
    this.forces?.sample(mj, model, data);
    this.forceClosure = this.forces ? new ForceClosure(this, this.forces, this.controller) : null;
    this.peaks.fill(0);
    this.saturated.fill(0);
    this.fellAt.clear();
    this.pushes.forget();
    this.grab.forget();
    this.faults.reprime();
    this.setController(this.controller);
  }

  private placeRoot(r: SimEngine['robots'][number], initial: RobotPoseState) {
    const p = r.rootQpos >= 0 ? initial.roots?.[r.key]?.position : null;

    if (!p) return;

    this.data.qpos[r.rootQpos] += p[0] / 1000;
    this.data.qpos[r.rootQpos + 1] += -p[2] / 1000;
    this.data.qpos[r.rootQpos + 2] += p[1] / 1000;
  }

  respawn(key?: string) {
    const r = this.robots.find((x) => x.key === key) ?? this.robots[0];

    if (!r) return;

    const { mj, model, data } = this;

    r.joints.forEach((i) => {
      const j = this.sim.joints[i];
      const v = this.sim.initial.values[j.id];
      const at = this.jointQpos[i];

      data.qpos[at] = v === undefined ? model.qpos0[at] : readout.jointQposOf(j.type, v);
      data.qvel[this.jointDof[i]] = 0;
    });

    if (r.rootQpos >= 0) {
      for (let k = 0; k < 7; k++) data.qpos[r.rootQpos + k] = model.qpos0[r.rootQpos + k];

      for (let k = 0; k < 6; k++) data.qvel[r.rootDof + k] = 0;

      this.placeRoot(r, this.sim.initial);
    }

    this.fellAt.delete(r.key);
    this.pushes.forget();
    this.grab.forget();
    this.setController(this.controller);
    mj.mj_forward(model, data);
    primeJointControls(this.mj, this, this.jointQpos, r.joints);
    this.faults.reprime();
  }

  setController(c: Controller) {
    assertTendonController(c, this.sim.joints);

    this.teaching = null;
    this.controller = c;
    this.given.clear();
    this.policyState?.eyes?.dispose();
    this.policyState = null;
    this.drive = c.kind === 'drive' ? createDrive(c.setup) : null;
    this.arms = c.kind === 'policy' && c.pose ? new PoseDrive(c.pose) : null;
    this.faults.setLimpAll(c.kind === 'limp');
    this.route = c.kind === 'route' ? this.routeRunner(c) : null;

    const pc = routePolicy(c);

    if (!pc) return;

    const r = this.robots.find((x) => x.key === pc.robot) ?? this.robots.find((x) => x.floating);

    this.policyState = createPolicyState(pc.policy, {
      data: this.data,
      joints: this.sim.joints,
      root: r,
      addresses: { qpos: this.jointQpos, dof: this.jointDof },
      eyes: () => policyEyes(this.mj, this.model, this.data, pc.policy.eyes),
    });
  }

  private routeRunner(c: RouteController): RouteRunner {
    const r = this.robots.find((x) => x.key === c.robot) ?? this.robots.find((x) => x.floating);

    return new RouteRunner(c, { rootQpos: r?.rootQpos ?? 0, joints: this.sim.joints });
  }

  command(c: DriveCommand) {
    this.given.set(c.slot ?? 0, c);
    this.commandHook?.(c);

    if (this.teaching) return this.teaching.command(c, this.holdValues());

    this.drive?.command(c, this.drive.hand ? this.holdValues() : undefined);
    this.arms?.command(c);

    if (this.policyState) this.policyState.command = [c.v[0], c.v[1], c.v[2]];
  }

  givenCommands(): DriveCommand[] {
    return [...this.given.values()];
  }

  grabStart(body: number, point: [number, number, number]) {
    this.grabEnd();

    const id = this.bodyIds[body];

    if (id === undefined || id < 0) return;

    this.grab.start(id, point);
  }

  grabMove(point: [number, number, number], turn: [number, number, number, number] | null) {
    this.grab.move(point, turn);
  }

  grabEnd() {
    this.grab.end();
  }

  pushRobot(key: string, force: [number, number, number], timing: PushTiming = {}) {
    const r = this.robots.find((x) => x.key === key) ?? this.robots[0];

    if (r) this.pushes.start(r.rootBody, force, { ...timing, tilt: () => robotTilt(this.data, r.rootBody) });
  }

  setFault(jointId: string, kind: FaultKind | null) {
    const i = this.sim.joints.findIndex((j) => j.id === jointId);
    const j = this.sim.joints[i];

    if (!j || j.actuator < 0) return;

    this.faults.set(j.actuator, kind, j.drive === 'position' ? this.data.qpos[this.jointQpos[i]] : 0);
  }

  private applyControl() {
    const { data } = this;
    const c = this.controller;

    if (this.teaching) return this.teaching.apply(data);

    if (c.kind === 'limp') return;

    if (this.drive) {
      this.applyDrive(this.drive);

      return;
    }

    const values = controlValues(c, data.time);
    const ctrl = data.ctrl;

    this.sim.joints.forEach((j, i) => {
      if (j.actuator >= 0) ctrl[j.actuator] = readout.readControlTarget(this.sim, i, values);
    });

    const ps = this.policyState;
    const pc = routePolicy(c);

    this.route?.apply(data, ps);

    if (pc && ps) this.applyPolicy(pc.policy, ps);

    if (this.arms) this.applyArms(this.arms);
  }

  private applyArms(arms: PoseDrive) {
    const { values } = arms.tick(this.data.time);
    const ctrl = this.data.ctrl;

    this.sim.joints.forEach((j, i) => {
      if (j.actuator >= 0 && j.drive === 'position' && values?.[j.id] !== undefined)
        ctrl[j.actuator] = readout.readControlTarget(this.sim, i, values);
    });
  }

  private applyDrive(drive: DriveLoop) {
    const { values, wheels } = drive.tick(this.data.time);
    const ctrl = this.data.ctrl;

    this.sim.joints.forEach((j, i) => {
      if (j.actuator < 0) return;

      ctrl[j.actuator] =
        j.drive === 'velocity' ? (wheels?.[j.id] ?? 0) : readout.readControlTarget(this.sim, i, values);
    });
    this.forceClosure?.apply();
  }

  private applyPolicy(policy: PolicySpec, ps: PolicyState) {
    const { data } = this;

    stepPolicy(policy, ps, data);

    const ctrl = data.ctrl;

    ps.actuators.forEach((actuator, k) => {
      if (actuator >= 0) ctrl[actuator] = ps.targets[k];
    });
  }

  step(seconds: number, afterStep?: () => void) {
    const { mj, data } = this;
    const steps = Math.max(1, Math.round(seconds / this.dt));
    const { joints } = this.sim;

    for (let s = 0; s < steps; s++) {
      this.beforeStepHook?.();
      this.world.advance(data.time + this.dt);
      this.applyControl();
      this.faults.apply(data.ctrl);
      this.pushes.apply();
      this.grab.apply();
      stepControlled(mj, this);
      this.forces?.sample(mj, this.model, data);
      afterStep?.();
      this.scanner?.tick();
      this.stepHook?.();

      const force = data.actuator_force;

      for (let i = 0; i < joints.length; i++) {
        const actuator = joints[i].actuator;
        const u = actuator >= 0 ? Math.abs(force[actuator]) / joints[i].effort : 0;

        if (u > this.peaks[i]) this.peaks[i] = u;

        if (u >= 0.98) this.saturated[i] += this.dt;
      }

      this.checkFalls();
      this.continuationHook?.();
    }
  }

  startTeaching(setup: ArmSetup) {
    if (this.teaching) return;

    this.teaching = new TeachingControl(
      { controller: this.controller, state: this.policyState, setup, sim: this.sim },
      this.dt,
    );
    this.teaching.initialize(this.data, this.model);
  }

  readonly handoff = (owner: ActionOwner) => this.teaching?.handoff(owner, this.data);

  readonly teachingSource = () => this.teaching;

  private checkFalls() {
    for (const r of this.robots) {
      if (!r.floating || this.fellAt.has(r.key)) continue;

      const z = this.data.xpos[r.rootBody * 3 + 2];

      if (robotTilt(this.data, r.rootBody) > 60 || z < r.startZ * 0.45) this.fellAt.set(r.key, this.data.time);
    }
  }

  stats(rtf = 1): SimStats {
    return readEngineStats(
      {
        data: this.data,
        sim: this.sim,
        robots: this.robots,
        fellAt: this.fellAt,
        peaks: this.peaks,
        saturated: this.saturated,
        faults: this.faults,
        drive: this.drive,
        tiltOf: (r) => robotTilt(this.data, r.rootBody),
        handAt: (h) => effectorAt(this.sim, this.poses(), h),
      },
      rtf,
    );
  }

  private holdValues(): Record<string, number> {
    return readout.readHoldValues(this.sim, this.model, this.data, { qpos: this.jointQpos, dof: this.jointDof });
  }

  jointAddresses(): Int32Array {
    return Int32Array.from(this.jointQpos);
  }

  dofAddresses(): Int32Array {
    return Int32Array.from(this.jointDof);
  }

  rootAddresses(): [number, number] {
    const r = this.robots[0];

    return r ? [r.rootQpos, r.rootDof] : [-1, -1];
  }

  refreshKinematics() {
    this.mj.mj_kinematics(this.model, this.data);
  }

  observeForces(evidence: ForceEvidence | null) {
    this.forces?.dispose();
    this.forces = evidence ? new ContactForces(this.mj, this.model, this.bodyIds, evidence) : null;
    this.forceClosure = this.forces ? new ForceClosure(this, this.forces, this.controller) : null;
    this.forces?.sample(this.mj, this.model, this.data);
  }

  contactPairs(): Int32Array {
    return this.contacts.sample(this.data);
  }

  setState(qpos: ArrayLike<number>) {
    this.data.qpos.set(qpos);
    this.data.qvel.fill(0);
    this.mj.mj_forward(this.model, this.data);
  }

  poses(out = new Float64Array(this.bodyIds.length * 7)): Float64Array {
    return readout.readBodyPoses(this.data, this.bodyIds, out);
  }

  jointStates(out = new Float64Array(this.sim.joints.length * 3)): Float64Array {
    return readout.readJointStates(this.sim, this.data, this.jointQpos, out);
  }

  jointAngles(): Float64Array {
    return readout.readJointAngles(this.data, this.jointQpos);
  }

  dispose() {
    this.policyState?.eyes?.dispose();
    this.scanner?.dispose();
    this.forces?.dispose();
    this.data.delete();
    this.model.delete();
  }
}
