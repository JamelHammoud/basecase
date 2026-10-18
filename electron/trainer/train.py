"""
Basecase policy trainer: PPO on the scene's own MuJoCo model.

Basecase writes a job folder (model.xml from the scene, job.json with the task and joints) and
runs this script through uv (see electron/trainer.mjs). Progress goes to stdout as one JSON
object per line. The result is policy.json, which the app's simulator runs (src/sim/policy.ts),
and policy.onnx for running it anywhere else.

The observation and action must match src/sim/policy.ts exactly:
  obs = [gravity_b(3), angvel_b(3), linvel_b(3), command(3), q - default(n), qd(n), last_action(n)]
  target = default + action_scale * clip(action, -1, 1)
MuJoCo axes: the robot faces -Y and its left is +X, so "forward" velocity is -v_b.y.

Sim-to-real: every environment gets its own friction, link masses and servo stiffness, and the
robot is shoved at random, so the policy can't rely on the model being exact.
"""

import argparse
import json
import math
import os
import signal
import sys
import time
from dataclasses import dataclass, field

import mujoco
import numpy as np
import torch
from mujoco import rollout
from torch import nn

POLICY_FORMAT = "basecase-policy"
POLICY_VERSION = 1
FULL = mujoco.mjtState.mjSTATE_FULLPHYSICS


def emit(**kw):
    print(json.dumps(kw), flush=True)


def quat_rotate_inverse(q, v):
    """Rotates world vectors v (n,3) into frames q (n,4: w,x,y,z)."""
    w = q[:, :1]
    u = q[:, 1:]
    a = v * (2.0 * w * w - 1.0)
    b = np.cross(u, v) * w * 2.0
    c = u * np.sum(u * v, axis=1, keepdims=True) * 2.0
    return a - b + c


def quat_mul(a, b):
    aw, ax, ay, az = a
    bw, bx, by, bz = b
    return np.array(
        [
            aw * bw - ax * bx - ay * by - az * bz,
            aw * bx + ax * bw + ay * bz - az * by,
            aw * by - ax * bz + ay * bw + az * bx,
            aw * bz + ax * by - ay * bx + az * bw,
        ]
    )


class Envs:
    """n copies of the robot, stepped together by MuJoCo's threaded rollout."""

    def __init__(self, xml, job, n, seed):
        self.job = job
        self.n = n
        self.rng = np.random.default_rng(seed)
        self.task = job["task"]
        base = mujoco.MjModel.from_xml_string(xml)
        self.base = base
        dt = base.opt.timestep
        self.decim = max(1, round(job["controlDt"] / dt))
        self.control_dt = self.decim * dt
        self.episode_steps = int((10.0 if self.task == "stand" else 15.0) / self.control_dt)

        self._index_robot(base)
        self._settle(base)
        self.models = self._randomized_models(xml, n)
        nthread = max(1, min(os.cpu_count() or 4, n))
        self.datas = [mujoco.MjData(base) for _ in range(nthread)]
        self.roller = rollout.Rollout(nthread=nthread)

        self.state = np.tile(self.s0, (n, 1))
        self.t = np.zeros(n, dtype=np.int64)
        self.last_action = np.zeros((n, self.na))
        self.push_at = self.rng.integers(int(2 / self.control_dt), int(5 / self.control_dt), size=n)
        self.mass = float(np.sum(base.body_mass))
        for i in range(n):
            self._reset(i)

    def _index_robot(self, base):
        job = self.job
        root = base.joint(job["root"])
        self.rq = int(root.qposadr[0])
        self.rd = int(root.dofadr[0])
        self.jq = np.array([int(base.joint(j["name"]).qposadr[0]) for j in job["joints"]])
        self.jd = np.array([int(base.joint(j["name"]).dofadr[0]) for j in job["joints"]])
        self.ai = np.array([int(base.actuator(j["name"]).id) for j in job["joints"]])
        self.na = len(self.jq)
        self.default = np.array(job["defaultPose"], dtype=np.float64)
        self.scale = float(job["actionScale"])
        rng_lo = base.actuator_ctrlrange[self.ai, 0]
        rng_hi = base.actuator_ctrlrange[self.ai, 1]
        limited = base.actuator_ctrllimited[self.ai].astype(bool)
        self.lo = np.where(limited, rng_lo, -np.inf)
        self.hi = np.where(limited, rng_hi, np.inf)
        self.ctrl0 = np.array(job["ctrlDefault"], dtype=np.float64)
        self.command = np.array(job["command"], dtype=np.float64)

    def _settle(self, base):
        dt = base.opt.timestep
        # Start state: the canvas pose, settled for a second holding it
        d = mujoco.MjData(base)
        self._start_pose(base, d)
        d.ctrl[:] = self.ctrl0
        mujoco.mj_forward(base, d)
        z_start = float(d.qpos[self.rq + 2])
        for _ in range(int(1.0 / dt)):
            mujoco.mj_step(base, d)
        settled_up = -quat_rotate_inverse(d.qpos[None, self.rq + 3 : self.rq + 7], np.array([[0, 0, -1.0]]))[0, 2]
        if settled_up < math.cos(math.radians(20)):
            # It can't hold the pose by itself: start from the unsettled pose, the policy must learn to catch it
            mujoco.mj_resetData(base, d)
            self._start_pose(base, d)
            mujoco.mj_forward(base, d)
            self.holds_pose = False
        else:
            self.holds_pose = True
        d.qvel[:] = 0
        d.time = 0
        self.z0 = float(d.qpos[self.rq + 2]) if self.holds_pose else z_start
        self.nstate = mujoco.mj_stateSize(base, FULL)
        self.s0 = np.empty(self.nstate)
        mujoco.mj_getState(base, d, self.s0, FULL)
        self.nq, self.nv = base.nq, base.nv
        # State layout: time, qpos, qvel, …
        self.oq = 1
        self.ov = 1 + self.nq

    def _randomized_models(self, xml, n):
        # Domain randomization: one model per environment
        models = []
        for _ in range(n):
            m = mujoco.MjModel.from_xml_string(xml)
            m.geom_friction[:, 0] *= self.rng.uniform(0.6, 1.3)
            m.body_mass[1:] *= self.rng.uniform(0.85, 1.15, size=m.nbody - 1)
            k = self.rng.uniform(0.85, 1.15, size=m.nu)
            m.actuator_gainprm[:, 0] *= k
            m.actuator_biasprm[:, 1] *= k
            m.actuator_biasprm[:, 2] *= k
            models.append(m)
        return models

    def _start_pose(self, m, d):
        """The canvas pose: joint values by MuJoCo joint name, root lifted to just above the floor."""
        for name, v in self.job["initialJoints"].items():
            d.qpos[int(m.joint(name).qposadr[0])] = v
        d.qpos[self.rq : self.rq + 3] += np.array(self.job["rootOffset"])

    def _reset(self, i):
        s = self.s0.copy()
        q = s[self.oq : self.oq + self.nq]
        q[self.jq] += self.rng.uniform(-0.05, 0.05, size=self.na)
        q[self.jq] = np.clip(q[self.jq], self.lo, self.hi)
        # Any heading: the command is in the robot's own frame
        yaw = self.rng.uniform(-math.pi, math.pi)
        q[self.rq + 3 : self.rq + 7] = quat_mul(
            [math.cos(yaw / 2), 0, 0, math.sin(yaw / 2)], q[self.rq + 3 : self.rq + 7]
        )
        self.state[i] = s
        self.t[i] = 0
        self.last_action[i] = 0

    def observe(self):
        qpos = self.state[:, self.oq : self.oq + self.nq]
        qvel = self.state[:, self.ov : self.ov + self.nv]
        quat = qpos[:, self.rq + 3 : self.rq + 7]
        g = quat_rotate_inverse(quat, np.tile([0, 0, -1.0], (self.n, 1)))
        w = qvel[:, self.rd + 3 : self.rd + 6]
        v = quat_rotate_inverse(quat, qvel[:, self.rd : self.rd + 3])
        cmd = np.tile(self.command, (self.n, 1))
        jp = qpos[:, self.jq] - self.default
        jv = qvel[:, self.jd]
        return np.concatenate([g, w, v, cmd, jp, jv, self.last_action], axis=1).astype(np.float32)

    def step(self, action):
        a = np.clip(action, -1.0, 1.0)
        targets = np.clip(self.default + self.scale * a, self.lo, self.hi)
        ctrl = np.tile(self.ctrl0, (self.n, 1))
        ctrl[:, self.ai] = targets
        control = np.repeat(ctrl[:, None, :], self.decim, axis=1)

        # Shoves: a sideways kick to the root's velocity every few seconds
        due = self.t >= self.push_at
        if np.any(due):
            ang = self.rng.uniform(0, 2 * math.pi, size=int(due.sum()))
            speed = self.rng.uniform(0.2, 0.6, size=int(due.sum()))
            self.state[due, self.ov + self.rd] += np.cos(ang) * speed
            self.state[due, self.ov + self.rd + 1] += np.sin(ang) * speed
            self.push_at[due] = self.t[due] + self.rng.integers(
                int(2 / self.control_dt), int(5 / self.control_dt), size=int(due.sum())
            )

        states, _ = self.roller.rollout(self.models, self.datas, self.state, control, nstep=self.decim)
        self.state = np.ascontiguousarray(states[:, -1, :])
        self.t += 1

        qpos = self.state[:, self.oq : self.oq + self.nq]
        qvel = self.state[:, self.ov : self.ov + self.nv]
        quat = qpos[:, self.rq + 3 : self.rq + 7]
        g = quat_rotate_inverse(quat, np.tile([0, 0, -1.0], (self.n, 1)))
        v = quat_rotate_inverse(quat, qvel[:, self.rd : self.rd + 3])
        w = qvel[:, self.rd + 3 : self.rd + 6]
        z = qpos[:, self.rq + 2]
        jp = qpos[:, self.jq] - self.default
        jv = qvel[:, self.jd]
        fwd, left = -v[:, 1], v[:, 0]
        upright = np.exp(-np.sum(g[:, :2] ** 2, axis=1) / 0.05)
        height = np.exp(-(((z - self.z0) / (0.08 * max(self.z0, 0.05))) ** 2))
        rate = np.sum((a - self.last_action) ** 2, axis=1)
        if self.task == "stand":
            r = (
                1.0 * upright
                + 0.5 * height
                + 0.3 * np.exp(-np.sum(jp**2, axis=1) / 0.1)
                - 0.5 * (fwd**2 + left**2)
                - 0.05 * np.sum(w[:, :2] ** 2, axis=1)
                - 0.02 * rate
                - 1e-4 * np.sum(jv**2, axis=1)
            )
        else:
            track = np.exp(-((fwd - self.command[0]) ** 2 + (left - self.command[1]) ** 2) / 0.05)
            turn = np.exp(-((w[:, 2] - self.command[2]) ** 2) / 0.25)
            r = (
                1.5 * track
                + 0.5 * turn
                + 0.5 * upright
                + 0.2 * height
                - 0.05 * np.sum(w[:, :2] ** 2, axis=1)
                - 0.02 * rate
                - 2e-4 * np.sum(jv**2, axis=1)
            )
        r = r * self.control_dt * 10  # per-second scale, so rewards don't depend on the control rate
        fell = (-g[:, 2] < 0.5) | (z < 0.45 * self.z0)
        r = np.where(fell, r - 2.0, r)
        timeout = self.t >= self.episode_steps
        done = fell | timeout
        self.last_action = a
        for i in np.nonzero(done)[0]:
            self._reset(i)
        return r.astype(np.float32), fell, timeout


class Normalizer:
    def __init__(self, size):
        self.mean = np.zeros(size, dtype=np.float64)
        self.var = np.ones(size, dtype=np.float64)
        self.count = 1e-4

    def update(self, x):
        m, v, c = x.mean(0), x.var(0), x.shape[0]
        delta = m - self.mean
        tot = self.count + c
        self.mean = self.mean + delta * c / tot
        self.var = (self.var * self.count + v * c + delta**2 * self.count * c / tot) / tot
        self.count = tot

    @property
    def std(self):
        return np.sqrt(self.var + 1e-8)

    def __call__(self, x):
        return np.clip((x - self.mean) / self.std, -5, 5).astype(np.float32)


def mlp(sizes, out_gain=1.0):
    layers = []
    for i in range(len(sizes) - 1):
        lin = nn.Linear(sizes[i], sizes[i + 1])
        nn.init.orthogonal_(lin.weight, math.sqrt(2) if i < len(sizes) - 2 else out_gain)
        nn.init.zeros_(lin.bias)
        layers.append(lin)
        if i < len(sizes) - 2:
            layers.append(nn.ELU())
    return nn.Sequential(*layers)


class ActorCritic(nn.Module):
    def __init__(self, nobs, nact, hidden=(256, 128, 64)):
        super().__init__()
        self.actor = mlp([nobs, *hidden, nact], out_gain=0.01)
        self.critic = mlp([nobs, *hidden, 1], out_gain=1.0)
        self.log_std = nn.Parameter(torch.full((nact,), -0.7))

    def dist(self, obs):
        mu = self.actor(obs)
        return torch.distributions.Normal(mu, self.log_std.exp().expand_as(mu))


@dataclass
class Policy:
    model: ActorCritic
    norm: Normalizer


def export(path, job, policy, steps):
    model, norm = policy.model, policy.norm
    layers = []
    for mod in model.actor:
        if isinstance(mod, nn.Linear):
            w = mod.weight.detach().cpu().numpy()
            layers.append(
                {
                    "in": int(w.shape[1]),
                    "out": int(w.shape[0]),
                    "w": [round(float(x), 7) for x in w.reshape(-1)],
                    "b": [round(float(x), 7) for x in mod.bias.detach().cpu().numpy()],
                }
            )
    spec = {
        "format": POLICY_FORMAT,
        "version": POLICY_VERSION,
        "task": job["task"],
        "robot": job["robotName"],
        "joints": [j["id"] for j in job["joints"]],
        "defaultPose": [float(x) for x in job["defaultPose"]],
        "actionScale": float(job["actionScale"]),
        "controlDt": float(job["controlDt"]),
        "command": [float(x) for x in job["command"]],
        "obsMean": [float(x) for x in norm.mean],
        "obsStd": [float(x) for x in norm.std],
        "layers": layers,
        "activation": "elu",
        "trainedSteps": int(steps),
        "mujoco": mujoco.__version__,
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(spec, f)
    os.replace(tmp, path)
    return spec


def export_onnx(path, model, norm, nobs):
    class Deploy(nn.Module):
        def __init__(self):
            super().__init__()
            self.actor = model.actor
            self.register_buffer("mean", torch.tensor(norm.mean, dtype=torch.float32))
            self.register_buffer("std", torch.tensor(norm.std, dtype=torch.float32))

        def forward(self, obs):
            x = torch.clamp((obs - self.mean) / self.std, -5, 5)
            return torch.clamp(self.actor(x), -1, 1)

    try:
        torch.onnx.export(
            Deploy(), torch.zeros(1, nobs), path, input_names=["obs"], output_names=["action"], dynamo=False
        )
    except Exception as e:  # ONNX is a convenience for other runtimes; the app runs policy.json
        emit(type="status", message=f"Skipped ONNX export: {e}")


def evaluate(xml, job, policy, seconds=8.0):
    """A clean run (no randomization, no shoves) with the policy's mean action."""
    model, norm = policy.model, policy.norm
    env = Envs(xml, job, 1, seed=123)
    env.models = [env.base]
    env.push_at[:] = 10**9
    env.state[0] = env.s0
    env.last_action[:] = 0
    start = env.state[0, env.oq + env.rq : env.oq + env.rq + 2].copy()
    fell_at = None
    steps = int(seconds / env.control_dt)
    for k in range(steps):
        obs = torch.tensor(norm(env.observe()))
        with torch.no_grad():
            a = model.actor(obs).numpy()
        env.t[:] = 0  # no timeouts during evaluation
        _, fell, _ = env.step(a)
        if fell[0]:
            fell_at = (k + 1) * env.control_dt
            break
    end = env.state[0, env.oq + env.rq : env.oq + env.rq + 2]
    return {
        "fellAt": fell_at,
        "seconds": seconds,
        "forward": float(-(end[1] - start[1])),
        "travelled": float(np.hypot(*(end - start))),
    }


@dataclass
class Hyper:
    horizon: int = 24
    epochs: int = 5
    minibatches: int = 4
    gamma: float = 0.99
    lam: float = 0.95
    clip: float = 0.2
    ent_coef: float = 0.004
    desired_kl: float = 0.01


@dataclass
class Rollout:
    obs: list = field(default_factory=list)
    act: list = field(default_factory=list)
    logp: list = field(default_factory=list)
    val: list = field(default_factory=list)
    rew: list = field(default_factory=list)
    done: list = field(default_factory=list)
    timeout: list = field(default_factory=list)


@dataclass
class Batch:
    obs: torch.Tensor
    act: torch.Tensor
    logp: torch.Tensor
    adv: torch.Tensor
    ret: torch.Tensor


@dataclass
class Run:
    job: dict
    policy_path: str
    budget: float
    stop: dict


class Ppo:
    def __init__(self, env, policy):
        self.env = env
        self.policy = policy
        self.model = policy.model
        self.norm = policy.norm
        self.opt = torch.optim.Adam(self.model.parameters(), lr=1e-3)
        self.lr = 1e-3
        self.hp = Hyper()
        self.steps = 0
        self.ep_ret = np.zeros(env.n)
        self.ep_len = np.zeros(env.n)
        self.recent_ret = []
        self.recent_len = []
        self.obs_raw = env.observe()
        self.norm.update(self.obs_raw)

    def track_episodes(self, r, finished):
        self.ep_ret += r
        self.ep_len += 1
        for i in np.nonzero(finished)[0]:
            self.recent_ret.append(self.ep_ret[i])
            self.recent_len.append(self.ep_len[i] * self.env.control_dt)
            self.ep_ret[i] = 0
            self.ep_len[i] = 0

    def trim_recent(self):
        if self.recent_ret:
            self.recent_ret, self.recent_len = self.recent_ret[-200:], self.recent_len[-200:]

    def collect(self):
        env, model = self.env, self.model
        buf = Rollout()
        for _ in range(self.hp.horizon):
            obs = self.norm(self.obs_raw)
            with torch.no_grad():
                ot = torch.from_numpy(obs)
                d = model.dist(ot)
                a = d.sample()
                logp = d.log_prob(a).sum(-1)
                v = model.critic(ot).squeeze(-1)
            r, fell, timeout = env.step(a.numpy())
            self.track_episodes(r, fell | timeout)
            buf.obs.append(ot)
            buf.act.append(a)
            buf.logp.append(logp)
            buf.val.append(v)
            buf.rew.append(torch.from_numpy(r))
            buf.done.append(torch.from_numpy((fell | timeout).astype(np.float32)))
            buf.timeout.append(torch.from_numpy(timeout.astype(np.float32)))
            self.obs_raw = env.observe()
            self.norm.update(self.obs_raw)
            self.steps += env.n
        return buf

    def advantages(self, buf):
        hp = self.hp
        with torch.no_grad():
            last_v = self.model.critic(torch.from_numpy(self.norm(self.obs_raw))).squeeze(-1)
        vals = torch.stack(buf.val)
        rews = torch.stack(buf.rew)
        dones = torch.stack(buf.done)
        # Timeouts aren't failures: bootstrap them with their own value
        rews = rews + hp.gamma * vals * torch.stack(buf.timeout)
        adv = torch.zeros_like(rews)
        gae = torch.zeros(self.env.n)
        for t in reversed(range(hp.horizon)):
            nv = last_v if t == hp.horizon - 1 else vals[t + 1]
            delta = rews[t] + hp.gamma * nv * (1 - dones[t]) - vals[t]
            gae = delta + hp.gamma * hp.lam * (1 - dones[t]) * gae
            adv[t] = gae
        return rews, adv, adv + vals

    def update(self, buf, adv, ret):
        hp = self.hp
        b_adv = adv.reshape(-1)
        b_adv = (b_adv - b_adv.mean()) / (b_adv.std() + 1e-8)
        batch = Batch(torch.cat(buf.obs), torch.cat(buf.act), torch.cat(buf.logp), b_adv, ret.reshape(-1))
        n = batch.obs.shape[0]
        mb = n // hp.minibatches
        for _ in range(hp.epochs):
            perm = torch.randperm(n)
            for k in range(hp.minibatches):
                self.minibatch_step(batch, perm[k * mb : (k + 1) * mb])

    def minibatch_step(self, batch, idx):
        hp, model = self.hp, self.model
        d = model.dist(batch.obs[idx])
        logp = d.log_prob(batch.act[idx]).sum(-1)
        ratio = torch.exp(logp - batch.logp[idx])
        pg = -torch.min(ratio * batch.adv[idx], torch.clamp(ratio, 1 - hp.clip, 1 + hp.clip) * batch.adv[idx]).mean()
        vloss = (model.critic(batch.obs[idx]).squeeze(-1) - batch.ret[idx]).pow(2).mean()
        ent = d.entropy().sum(-1).mean()
        loss = pg + 0.5 * vloss - hp.ent_coef * ent
        self.opt.zero_grad()
        loss.backward()
        nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        self.opt.step()
        with torch.no_grad():
            kl = (batch.logp[idx] - logp).mean().item()
        # Adaptive step size, as in rsl_rl
        if kl > hp.desired_kl * 2:
            self.lr = max(1e-5, self.lr / 1.5)
        elif kl < hp.desired_kl / 2:
            self.lr = min(1e-2, self.lr * 1.5)
        for g in self.opt.param_groups:
            g["lr"] = self.lr

    def iterate(self):
        buf = self.collect()
        rews, adv, ret = self.advantages(buf)
        self.update(buf, adv, ret)
        return rews


def train_loop(ppo, run):
    env = ppo.env
    start = time.time()
    last_save = start
    it = 0
    while not run.stop["now"] and time.time() - start < run.budget:
        rews = ppo.iterate()
        it += 1
        elapsed = time.time() - start
        ppo.trim_recent()
        emit(
            type="progress",
            iteration=it,
            steps=ppo.steps,
            elapsedS=elapsed,
            budgetS=run.budget,
            reward=float(rews.mean() / (env.control_dt * 10)),
            episodeS=float(np.mean(ppo.recent_len)) if ppo.recent_len else 0.0,
            fps=ppo.steps / max(elapsed, 1e-6),
        )
        if time.time() - last_save > 60:
            export(run.policy_path, run.job, ppo.policy, ppo.steps)
            last_save = time.time()


def parse_args():
    ap = argparse.ArgumentParser()
    ap.add_argument("--job", help="Folder with model.xml and job.json")
    ap.add_argument("--check", action="store_true", help="Print versions and exit")
    return ap.parse_args()


def emit_check():
    emit(
        type="check",
        mujoco=mujoco.__version__,
        torch=torch.__version__,
        python=sys.version.split()[0],
        cpus=os.cpu_count(),
    )


def load_job(folder):
    with open(os.path.join(folder, "job.json")) as f:
        job = json.load(f)
    with open(os.path.join(folder, "model.xml")) as f:
        xml = f.read()
    return job, xml


def install_stop_handlers():
    stop = {"now": False}
    signal.signal(signal.SIGTERM, lambda *_: stop.update(now=True))
    signal.signal(signal.SIGINT, lambda *_: stop.update(now=True))
    return stop


def main():
    args = parse_args()
    if args.check:
        emit_check()
        return

    job, xml = load_job(args.job)
    torch.set_num_threads(max(1, min(4, (os.cpu_count() or 4) // 2)))
    torch.manual_seed(0)

    budget = float(job["minutes"]) * 60
    stop = install_stop_handlers()

    emit(type="status", message="Building environments")
    nenv = int(job.get("envs", 64))
    env = Envs(xml, job, nenv, seed=1)
    nobs = 12 + 3 * env.na
    policy = Policy(ActorCritic(nobs, env.na), Normalizer(nobs))
    ppo = Ppo(env, policy)
    policy_path = os.path.join(args.job, "policy.json")

    if not env.holds_pose:
        emit(type="status", message="Can't hold the pose without help. Training from a fall.")
    emit(type="status", message=f"Training on {nenv} robots")

    train_loop(ppo, Run(job, policy_path, budget, stop))

    emit(type="status", message="Checking the policy")
    export(policy_path, job, policy, ppo.steps)
    export_onnx(os.path.join(args.job, "policy.onnx"), policy.model, policy.norm, nobs)
    result = evaluate(xml, job, policy)
    emit(type="done", policy=policy_path, steps=ppo.steps, stopped=stop["now"], eval=result)


if __name__ == "__main__":
    main()
