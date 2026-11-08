import type { SimModel } from '../sim/mjcfTypes';
import type { TrainedEntry } from './kitEnvironment';
import { footCount, kitTopSpeed } from './kitModel';

const num = (x: number) => x.toPrecision(6);

const SHARED = `
def upright(state):
    return exp(-(state.gravity[0] ** 2 + state.gravity[1] ** 2) / 0.05)

def height(state):
    return exp(-((state.z - state.z0) / (0.08 * max(state.z0, 0.05))) ** 2)

def fell(state):
    return -state.gravity[2] < 0.5 or state.z < 0.45 * state.z0

def per_second(state):
    return state.control_dt * 10

def calm(state):
    return (
        0.05 * sum(state.angvel[:2] ** 2)
        + 0.02 * sum((state.action - state.last_action) ** 2)
        + 2e-4 * sum(state.joint_vel ** 2)
    )
`;

const STAND = `
def reward(state):
    scale = per_second(state)
    forward = -state.linvel[1]
    left = state.linvel[0]
    return (
        term("upright", 1.0 * upright(state) * scale)
        + term("height", 0.5 * height(state) * scale)
        + term("pose", 0.5 * exp(-sum(state.joint_pos ** 2) / 0.1) * scale)
        - term("drift", 1.0 * (forward ** 2 + left ** 2) * scale)
        - term("calm", calm(state) * scale)
        - term("fall", 2.0 if fell(state) else 0.0)
    )
`;

interface Steering {
  turn: number;
  turnSigma2: number;
  veer: number;
  stillness: number;
  hold: number;
}

const MANY_LEGS: Steering = { turn: 0.8, turnSigma2: 0.1, veer: 0.5, stillness: 0.01, hold: 1 };
const TWO_LEGS: Steering = { turn: 2, turnSigma2: 0.05, veer: 0, stillness: 0.002, hold: 0 };

const velocity = (top: number, steer: Steering) => `
def still(state):
    return 1.0 if abs(state.command[0]) + abs(state.command[1]) + abs(state.command[2]) < 0.01 else 0.0

def reward(state):
    scale = per_second(state)
    forward = -state.linvel[1]
    left = state.linvel[0]
    speed_error = (forward - state.command[0]) ** 2 + (left - state.command[1]) ** 2
    turn_error = (state.angvel[2] - state.command[2]) ** 2
    hush = still(state)
    return (
        term("track", 1.5 * exp(-speed_error / ${num((0.5 * top) ** 2)}) * scale)
        + term("track_fine", 0.5 * exp(-speed_error / ${num((0.2 * top) ** 2)}) * scale)
        - term("lag", 0.5 * sqrt(speed_error) / ${num(top)} * scale)
        + term("turn", ${num(steer.turn)} * exp(-turn_error / ${num(steer.turnSigma2)}) * scale)
        - term("veer", ${num(steer.veer)} * sqrt(turn_error) * scale)
        + term("upright", 0.5 * upright(state) * scale)
        + term("height", 0.3 * height(state) * scale)
        - term("bounce", 1.0 * state.linvel[2] ** 2 * scale)
        - term("calm", calm(state) * scale)
        - term("hush", hush * (0.3 * sum(state.joint_pos ** 2) + ${num(steer.stillness)} * sum(state.joint_vel ** 2)) * scale)
        - term("hold", ${num(steer.hold)} * hush * (0.3 * sum((state.action - state.last_action) ** 2) + 0.5 * clamp((forward ** 2 + left ** 2) / ${num((0.1 * top) ** 2)}, 0.0, 4.0)) * scale)
        - term("fall", 2.0 if fell(state) else 0.0)
    )
`;

const GET_UP = `
def reward(state):
    scale = per_second(state)
    rise = clamp(state.z / max(state.z0, 0.05), 0.0, 1.2)
    return (
        term("upright", 1.0 * upright(state) * scale)
        + term("rise", 1.5 * rise * scale)
        + term("height", 1.0 * height(state) * scale)
        + term("pose", 0.5 * exp(-sum(state.joint_pos ** 2) / 0.2) * scale)
        - term("calm", calm(state) * scale)
    )
`;

const SETTLE = `
def reward(state):
    scale = per_second(state)
    forward = -state.linvel[1]
    left = state.linvel[0]
    return (
        term("upright", 1.0 * upright(state) * scale)
        + term("height", 0.3 * height(state) * scale)
        + term("pose", 1.0 * exp(-sum(state.joint_pos ** 2) / 0.3) * scale)
        + term("pose_fine", 1.0 * exp(-sum(state.joint_pos ** 2) / 0.03) * scale)
        - term("offset", 1.0 * sum(state.joint_pos ** 2) * scale)
        - term("effort", 0.1 * sum(state.action ** 2) * scale)
        - term("drift", 1.0 * (forward ** 2 + left ** 2) * scale)
        - term("calm", calm(state) * scale)
        - term("fall", 2.0 if fell(state) else 0.0)
    )
`;

const PROGRAMS: Record<TrainedEntry, (model: SimModel) => string> = {
  stand: () => STAND,
  'velocity-tracking': (model) => velocity(kitTopSpeed(model), footCount(model) >= 4 ? MANY_LEGS : TWO_LEGS),
  'get-up': () => GET_UP,
  'settle-to-neutral': () => SETTLE,
};

export const kitReward = (model: SimModel, entry: TrainedEntry) => `${SHARED}${PROGRAMS[entry](model)}`;
