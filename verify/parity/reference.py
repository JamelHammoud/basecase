"""C MuJoCo reference for parity tests: steps each fixture and writes what it computed."""

import json
import os
import sys

import mujoco
import numpy as np


def reference(xml, steps):
    model = mujoco.MjModel.from_xml_string(xml)
    data = mujoco.MjData(model)
    mujoco.mj_forward(model, data)
    single = {
        "qpos": data.qpos.tolist(),
        "xpos": data.xpos.reshape(-1).tolist(),
        "cinert": data.cinert.reshape(-1).tolist(),
        "qfrc_bias": data.qfrc_bias.tolist(),
        "qacc": data.qacc.tolist(),
        "ncon": int(data.ncon),
    }
    rollout = []
    for i in range(steps):
        data.ctrl[:] = 0.2 * np.sin(0.01 * i)
        mujoco.mj_step(model, data)
        if (i + 1) % 25 == 0:
            rollout.append({"step": i + 1, "qpos": data.qpos.tolist(), "qvel": data.qvel.tolist()})
    return {"version": mujoco.__version__, "single": single, "rollout": rollout}


def main():
    root, steps = sys.argv[1], int(sys.argv[2])
    for name in sorted(os.listdir(root)):
        path = os.path.join(root, name, "model.xml")
        if not os.path.exists(path):
            continue
        with open(path) as f:
            result = reference(f.read(), steps)
        with open(os.path.join(root, name, "reference.json"), "w") as f:
            json.dump(result, f)
    print(json.dumps({"mujoco": mujoco.__version__}))


if __name__ == "__main__":
    main()
