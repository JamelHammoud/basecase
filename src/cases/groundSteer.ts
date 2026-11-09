import * as THREE from 'three';
import type { DriveCommand } from '../sim/driveTypes';
import { simDeltas, worldDeltas } from '../sim/mjcfFrames';
import type { SimModel } from '../sim/mjcfTypes';
import type { V3 } from '../utils/kinematics';

export interface SteerBase {
  model: SimModel;
  part: string;
  point: V3;
  forward: V3;
  objectAt: Map<string, V3>;
  sideways: boolean;
}

export interface WaypointOptions {
  speed?: number;
  push?: string;
}

interface Waypoint {
  at: V3;
  speed: number;
  push?: string;
}

interface Pose {
  at: THREE.Vector3;
  heading: THREE.Vector3;
}

const PASS_MM = 30;
const BEHIND_PASS_MM = 150;
const STOP_MM = 40;
const TURN_GAIN = 2.5;
const TURN_ONLY_RAD = Math.PI / 3;
const PUSH_BEHIND_SHARE = 0.7;
const PUSH_TURN_GAIN = 2;

const clampUnit = (x: number) => Math.max(-1, Math.min(1, x));

const flat = (from: THREE.Vector3, to: THREE.Vector3) => ({ dx: to.x - from.x, dz: to.z - from.z });

const point = (v: V3) => new THREE.Vector3(...v);

export class GroundSteer {
  private readonly base: SteerBase;

  private route: Waypoint[] = [];

  constructor(base: SteerBase) {
    this.base = base;
  }

  get steering() {
    return this.route.length > 0;
  }

  add(at: V3, { speed = 1, push }: WaypointOptions = {}) {
    this.route.push({ at, speed: Math.max(0, Math.min(1, speed)), push });
  }

  clear() {
    this.route = [];
  }

  command(poses: Float64Array): DriveCommand {
    const pose = this.pose(poses);

    while (this.route.length > 1 && this.passed(pose, poses)) this.route.shift();

    const waypoint = this.route[0];

    if (this.route.length === 1 && this.arrived(pose, waypoint, poses)) {
      this.route = [];

      return { v: [0, 0, 0] };
    }

    const aim = waypoint.push ? this.pushAim(pose, waypoint, poses) : point(waypoint.at);
    const { dx, dz } = flat(pose.at, aim);
    const { heading } = pose;
    const angle = Math.atan2(heading.z * dx - heading.x * dz, heading.x * dx + heading.z * dz);
    const { speed } = waypoint;

    if (this.base.sideways) return { v: [Math.cos(angle) * speed, Math.sin(angle) * speed, 0] };

    const turn = clampUnit((waypoint.push ? PUSH_TURN_GAIN : TURN_GAIN) * angle);

    return { v: [(Math.abs(angle) > TURN_ONLY_RAD ? 0 : Math.cos(angle)) * speed, 0, turn] };
  }

  private pose(poses: Float64Array): Pose {
    const { model, part, forward } = this.base;
    const delta = simDeltas(model, poses).get(part) ?? new THREE.Matrix4();

    return {
      at: point(this.base.point).applyMatrix4(delta),
      heading: point(forward).transformDirection(delta),
    };
  }

  private objectNow(id: string, poses: Float64Array): THREE.Vector3 {
    const delta = worldDeltas(this.base.model, poses).get(id);

    return point(this.base.objectAt.get(id) ?? [0, 0, 0]).applyMatrix4(delta ?? new THREE.Matrix4());
  }

  private pushAim({ at }: Pose, { at: goal, push }: Waypoint, poses: Float64Array): THREE.Vector3 {
    const object = this.objectNow(push!, poses);
    const toGoal = flat(object, point(goal));
    const along = Math.hypot(toGoal.dx, toGoal.dz) || 1;
    const toObject = flat(at, object);
    const reach = Math.hypot(toObject.dx, toObject.dz) * PUSH_BEHIND_SHARE * (this.base.sideways ? 1 : -1);

    return new THREE.Vector3(object.x + (toGoal.dx / along) * reach, 0, object.z + (toGoal.dz / along) * reach);
  }

  private arrived({ at }: Pose, { at: goal, push }: Waypoint, poses: Float64Array): boolean {
    const from = push ? this.objectNow(push, poses) : at;
    const { dx, dz } = flat(from, point(goal));

    return Math.hypot(dx, dz) < STOP_MM;
  }

  private passed(pose: Pose, poses: Float64Array): boolean {
    const waypoint = this.route[0];

    if (waypoint.push) return this.arrived(pose, waypoint, poses);

    const { dx, dz } = flat(pose.at, point(waypoint.at));
    const distance = Math.hypot(dx, dz);
    const behind = pose.heading.x * dx + pose.heading.z * dz < 0;

    return distance < PASS_MM || (behind && distance < BEHIND_PASS_MM);
  }
}
