# Sim-to-real research digest

Collected 2026-11-07 for the robotics build ([Proof](../guide/proof.md) §0k). Nothing here was run on Basecase robots unless it says measured. Most numbers are self-reported by their authors, often on NVIDIA GPUs. Re-check a figure before you build on it.

## Measured on Basecase

- `train.py`, `quad-servo` fixture, 64 envs, M5 Pro: about 21-25K control steps/s. Phases over 20 iterations: gradient 0.72 s, physics 0.29 s, inference 0.12 s, reward 0.04 s, observe 0.03 s. See `verify/baselines/python-phases.json`.
- WASM and C MuJoCo 3.17 agree on all 12 fixtures to 1e-9 on one forward pass and 1e-6 over a 500-step rollout, and a planted `kp` change is caught (`verify/parity/`).

## What matters for hobby servos

For small robots the servo dominates. Ranked by evidence, from a synthesis rather than any single ablation:

1. Servo law: kp plus back-EMF damping. `position` kp with joint damping = viscous + K²/R reproduces the voltage P law, except rate limit, current limit and load-dependent friction.
2. Armature, about 10× link inertia on STS3215-class robots.
3. Latency. [BeyondMimic](https://arxiv.org/html/2508.08241): +2 ms raises velocity error, +10 ms fails 2 of 3 trials. [Mini Pupper 2](https://arxiv.org/html/2607.26434) measured 76 ms.
4. Joint zeros and IMU mount bias. Randomization cannot fix a systematic mount bias ([microduck_rl](https://github.com/pollen-robotics/microduck_rl)).
5. Friction. [BAM](https://arxiv.org/html/2410.08650v4): best model 1.5-2.9× lower MAE than Coulomb-viscous.
6. Voltage. Microduck: 6.5-8.2 V, sag gain 0-0.2.
7. Backlash. STS3215 [0.62° unloaded, 1.30° loaded](https://pmc.ncbi.nlm.nih.gov/articles/PMC13087586/) on one stand; no numeric A/B shows modelling it improves transfer.

### Parameters: do not copy these

- Force 2.94 N·m is the 12 V spec; 3.52 is a frictionless extrapolation. Measure it.
- Menagerie SO-101 kp 998 comes from a hard-coded 1 Ω and a unit assumption. Against BAM's 18 that is about 55×.
- STS3215 kp 18-21 holds only at P32, D0, 7.4 V. LeRobot defaults to P16, D32.
- Effective fits (armature 0.2, kp 250) and BAM physical values (armature 0.026, kp 18) are different things. Never mix them.
- `dampratio` resolves at compile time, so randomizing armature or mass does not update `kv`. Set `kv` yourself.
- Delay history starts at zero. Initialise it with `mj_initCtrlHistory` or the robot is kicked at reset.

### Published randomization

| System | Friction | Mass, COM | Actuator | Calibration | Delay |
|---|---|---|---|---|---|
| [Microduck](https://github.com/pollen-robotics/microduck_rl) | foot ×0.7-1.3 | ±5%, COM ±3→15 mm | friction, armature ×0.9-1.1 | encoder ±0.015 rad, IMU 6° | 15-30 ms |
| [Open Duck](https://github.com/apirrone/Open_Duck_Playground) | 0.5-1.0 | ×0.9-1.1, COM ±5 cm | kp ×0.9-1.1 | ±0.03 | 0-2 steps at 50 Hz |
| [BDX](https://arxiv.org/html/2501.05204) | randomized | randomized | inertia to 20% | encoder ±0.02 | not modelled |
| [NVIDIA SO-101](https://huggingface.co/nvidia/so101-reach) | n/a | n/a | gains ×0.7-1.3 | noise 0.01 | 20-80 ms |

Remove linear velocity from the actor and keep it in the critic. Microduck, Open Duck and Berkeley Humanoid Lite all walk this way.

## Predicting transfer

No validated score exists for hobby robots, so never show a transfer probability. What exists: [Autotune](https://arxiv.org/html/2502.20396) lowest replay MSE 8/10 grasps, highest 0/10 (small n). [Open Ant](https://arxiv.org/html/2607.18488) best sim policy ranked 6th of 10 on hardware. [Sim2Val](https://arxiv.org/pdf/2506.20553) quadruped sim-real ρ 0.073. [RoboGauge](https://arxiv.org/html/2602.00678) is a sim-to-sim scorecard, Go2 only.

Honest statistics: fixed n, one-sided Clopper-Pearson. 30/30 means at least 90.5% at 95% confidence, 5/5 only 55%. These hold only for pre-specified trials drawn independently from a fixed distribution.

"MAE under 2°" is not a readiness bar. One published fit reaches 1.76° mean with its elbow at 3.89°, against a 2.19° [teleport baseline](https://mcobzarenco-fontaine-blog.static.hf.space/posts/2026-08-11-sim-servo-sysid.html). Use per-joint skill against teleport and a first-order-plus-delay filter.

## Calibration and the reality loop

- Encoder-only fits port best to servos: [PACE](https://arxiv.org/html/2509.06342v1), [TrajID](https://arxiv.org/html/2604.10351). Most residual methods assume torque sensing or mocap.
- Better fit does not mean better transfer. Gate updates on held-out replay, a different load, postdiction (old policy in new sim predicts the old real result), then paired A/B.
- Armature, damping and gains scaled together leave trajectories unchanged, so anchor with a known mass. Report Measured, Consistent with preset, or Can't tell.
- [Dao & Fern](https://arxiv.org/html/2604.11090) distribution matching needs a policy that already transfers; falls yield no data for the failed direction.

## Training speed

- Time-to-skill is limited by sample efficiency, then learner, then physics.
- C MuJoCo on M5 Max is about 520-576K physics substeps/s, or about 55K control steps/s at decimation 10.
- [UniLab](https://arxiv.org/html/2605.30313v2): off-policy G1 at 18.8 min on M5 Max, physics idle most of the time. Its figures conflict internally.
- "Walks in under a minute" ([mjbatch](https://github.com/kevinzakka/mjbatch)) is a Go1 recipe with feet-only contact, PGS, clock and mirror. An [independent M5 Max run](https://github.com/mthomas100/local-robot) took about 2 minutes with later checkpoints collapsing. No evidence it carries to a fresh robot.
- A comparable duck walk used 393M steps on an RTX 5090 ([log](https://huggingface.co/datasets/witcheer/microduck-skill-tree)).
- [Schwarke et al.](https://arxiv.org/pdf/2404.02887): SHAC at 64 envs uses about 25× fewer samples than PPO at 2048, but soft-contact policies collapse on hard contact. [Song et al.](https://arxiv.org/abs/2403.14864): exact forward, smoothed gradient.

## Train anything

- [GenSim2](https://arxiv.org/html/2410.03645): keypoint planner by default, RL only when it cannot constrain the task.
- [Reward Design Agent](https://arxiv.org/html/2606.01672v1): 0.90 on ManiSkill, 0.42 on HumanoidBench.
- [HARBOR](https://arxiv.org/html/2606.08610): full harness 48/50 stage runs, no gates 41/50 with a silent defect, no experience 32/50. One task, n=4 reported for one model.
- Zero-shot ([BFM-Zero](https://arxiv.org/html/2511.04131v1), [Motivo](https://arxiv.org/html/2504.11054v1), [FB-MEBE](https://arxiv.org/html/2603.25464)) is per robot, usually needs mocap, and fails far from what was explored.
- [Composer policy](https://ar5iv.labs.arxiv.org/html/2403.11412): 97.22% over 360 real transitions; linear blending stayed under 50% in sim.

## Agents and evaluation

- [RoboPlayground](https://arxiv.org/html/2604.05226): with validation off, human verification stayed at 96.2 while task success was 12.0. Execute things.
- [RLE-Bench](https://arxiv.org/html/2609.34210v2): all models got zero worst-arm static-margin credit against a bar they were never told. Publish requirements, seal instance values.
- [Diagnostic refinement](https://arxiv.org/html/2605.28918v2): named failure modes beat metrics-only re-prompting. False alarms hurt too.
- [CaP-X](https://arxiv.org/html/2603.22435): raw images hurt relative to text; text describing visual change helps.
- [RHO](https://arxiv.org/html/2606.16458): protect the evaluator; withhold timing and cost from the optimisation loop.
- [BT-Agent](https://arxiv.org/html/2610.13862v1): only 57.3% of text successes also succeeded in Habitat, so symbolic passes are not enough.

## Prior art to adapt

| Project | Take |
|---|---|
| [Microduck Sandbox](https://huggingface.co/spaces/pollen-robotics/microduck-simulator) | Policy smoke checks, input arbitration, first-run feel |
| [Microduck Arena](https://github.com/pollen-robotics/microduck-arena) | Ideas only (no licence): server re-run, median replay, pose traces |
| [Duck Studio](https://github.com/Tim-is-coding/Microduck-Studio) | Sentence yields a draft, never a run |
| [mjswan](https://github.com/ttktjmt/mjswan) | Replayed-state parity fixtures, reversible ZIP format |
| [Isaac Lab-Arena](https://isaac-sim.github.io/IsaacLab-Arena/main/index.html) | Scene, embodiment, task; relational placement |
| [MuJoCo skills](https://github.com/google-deepmind/mujoco/tree/main/doc/skills) | `python`, `spec_editing`, `parity` levels |
| [BAM](https://github.com/Rhoban/bam) | STS3215, XL330 parameters; Feetech's [fork](https://gitee.com/ftservo/ftservo-bam) adds HD1910 |
| [NAD](https://github.com/Frank-ZY-Dou/Dynamics-Modeling) | Public real SO-101 logs with load, voltage and payloads |
| [warp-metal](https://github.com/innate-inc/warp-metal) | Known traps: factorisation bug above 32 DoF, Apple's unrolled-kernel miscompile |

## Design for transfer

Most mechanical rules have no controlled evidence. Supported: prefer identified servos, set return delay to 0, avoid barrel connectors on power, servo output on the joint axis, assume printed parts break within about 10 falls ([ToddlerBot](https://arxiv.org/html/2502.00893v4)) and keep single-part repair under 45 min. Folklore: low leg inertia improves transfer (armature dominates at servo scale), PA-CF beats PLA.

## Honest limits

Nearly all transfer evidence uses premium actuators. PWM servos have no published velocity-tracking result. Pollen's own twin [would have caught none](https://github.com/pollen-robotics/microduck/blob/main/docs/design/simulation.md) of a week of real bugs. Only the Stage 8 session answers whether any of this works on real hobby servos.
