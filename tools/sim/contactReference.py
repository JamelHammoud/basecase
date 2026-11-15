import json
import sys

import mujoco
import numpy as np


def prime_history(model, data):
    for actuator in range(model.nu):
        samples = int(model.actuator_history[actuator, 0])
        if model.actuator_historyadr[actuator] < 0 or not samples:
            continue
        times = [data.time - (samples - k) * model.opt.timestep for k in range(samples)]
        mujoco.mj_initCtrlHistory(model, data, actuator, times, [float(data.ctrl[actuator])] * samples)


def sample(model, snapshot, steps):
    data = mujoco.MjData(model)
    for field in ["qpos", "qvel", "ctrl"]:
        if field in snapshot:
            getattr(data, field)[:] = snapshot[field]
    data.time = snapshot.get("time", 0)
    prime_history(model, data)
    mujoco.mj_forward(model, data)
    contacts = sorted(
        sorted(mujoco.mj_id2name(model, mujoco.mjtObj.mjOBJ_GEOM, int(geom)) for geom in [c.geom1, c.geom2])
        for c in data.contact
    )
    for _ in range(steps):
        mujoco.mj_step(model, data)
    return {"contacts": contacts, "qpos": data.qpos.tolist(), "qvel": data.qvel.tolist()}


def replay_sample(model, data, step):
    mujoco.mj_kinematics(model, data)
    contacts = sorted(
        {
            "\0".join(
                sorted(
                    mujoco.mj_id2name(model, mujoco.mjtObj.mjOBJ_BODY, int(model.geom_bodyid[g]))
                    for g in [c.geom1, c.geom2]
                )
            )
            for c in data.contact
            if c.dist <= 0 and c.efc_address >= 0
        }
    )
    return {
        "step": step,
        "qpos": data.qpos.tolist(),
        "qvel": data.qvel.tolist(),
        "contacts": contacts,
        "poses": np.concatenate((data.xpos, data.xquat), axis=1).reshape(-1).tolist(),
    }


def replay(case, model):
    model.actuator_forcerange[:] = np.asarray(case["actuatorForceRange"]).reshape(model.actuator_forcerange.shape)
    data = mujoco.MjData(model)
    mujoco.mj_setState(model, data, np.asarray(case["state"]), case["signature"])
    samples = []
    initial = case["expected"][0]["step"] == 0
    if initial:
        mujoco.mj_forward(model, data)
        samples.append(replay_sample(model, data, 0))
    for step, ctrl in enumerate(case["controls"], start=1):
        data.ctrl[:] = ctrl
        mujoco.mj_step(model, data)
        if (step == 1 and not initial) or step % 10 == 0:
            samples.append(replay_sample(model, data, step))
    return samples


def reference(case):
    model = mujoco.MjModel.from_xml_string(case["xml"])
    if "controls" in case:
        return replay(case, model)
    snapshots = case.get("snapshots", [{"ctrl": case.get("ctrl", [0] * model.nu)}])
    return [sample(model, snapshot, case.get("steps", 0)) for snapshot in snapshots]


result = {"version": mujoco.__version__, "cases": [reference(case) for case in json.load(sys.stdin)]}
print(json.dumps(result, allow_nan=False))
