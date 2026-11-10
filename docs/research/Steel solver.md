# Steel solver: what Forge can borrow

Written 2026-11-09, the day Skild AI open-sourced Steel. It compares Steel with Forge as of commit `aaac9b9` ([Forge](../guide/forge.md) §8g). Nothing here was run: Steel needs CUDA, and the M5 Pro can't run it. Steel's numbers are Skild's own, on an NVIDIA RTX PRO 6000 Blackwell. Forge's numbers come from §8g. A gain marked "estimate" is reasoned from those numbers, not measured. Measure it before you build on it.

## Sources and licences

| What | Where | Licence |
|---|---|---|
| Launch post | [skild.ai/blogs/steel](https://skild.ai/blogs/steel) | — |
| Launch repo (README, licence, video; no code) | [skild-ai/steel](https://github.com/skild-ai/steel) | Apache-2.0 |
| The solver, `newton.solvers.SolverSteel` | [newton/_src/solvers/steel](https://github.com/newton-physics/newton/tree/main/newton/_src/solvers/steel) (Python and Warp, about 41K lines) | Apache-2.0 (Newton) |
| Browser port | [skild-ai/steel-webgpu](https://github.com/skild-ai/steel-webgpu) (`packages/steel-webgpu/src/wgsl.js`, about 4K lines of WGSL) | Apache-2.0 |

All three are Apache-2.0, so Forge can borrow code as well as ideas, with attribution in the file. Below, `steel/` means Newton's `newton/_src/solvers/steel/` and `webgpu/` means `steel-webgpu/packages/steel-webgpu/src/`. Line numbers are from the checkouts of 2026-11-09.

## What Steel is

- **Formulation:** reduced coordinates and velocity-level projected Gauss-Seidel (PGS) with symplectic Euler.
  - Dynamics: forward kinematics, then RNEA bias, then CRBA for H, then a dense float32 Cholesky per articulation.
  - Defaults (`steel/solver_steel.py:1841-1888`):
    - 12 iterations, relaxation 1, Baumgarte 0.2, CFM 1e-6;
    - contact warm start, joint limits and sleeping off;
    - run-to-run determinism not guaranteed.
  - Friction is a circular Coulomb disk per contact: the two tangent rows are solved as one 2×2 block, plus friction patches with anchors that carry tangential slip from step to step (`steel/friction.py`, `steel/friction_patches.py`).
  - There is no solref or solimp. Softness comes from Baumgarte, CFM, an optional regularization, and an experimental per-contact stiffness and damping law (`steel/contact_compliance.py`).
- **Claims:**
  - Single tasks: 3.8× PhysX by geometric mean over 20 tasks, and about 1.3× MuJoCo Warp.
  - Batches of different robots: up to 13× PhysX (3.90M steps/s at 245,760 environments of 20 task types).
  - Memory: at a matched batch, about 11 GiB against PhysX's 29.
  - These are simulation throughput, not training time. The single-task suite ran with the opt-in `reuse_kinematics`.

## Forge in one paragraph, for contrast

Forge reimplements MuJoCo's formulation for the subset Basecase generates:
- generalized coordinates;
- soft constraints with MuJoCo's impedance and regularization;
- pyramidal cones;
- the Newton solver with MuJoCo's exact line search;
- implicitfast.

It must match C MuJoCo 4.0 at L0–L3 on 200 fuzzed robots and replay every trained policy in C (L4, L5).

The Metal (F4) and WGSL (F6) engines both work the same way:
- They generate one kernel per model and run one GPU thread per world, in blocks of 16.
- Reals are double-float.
- The whole control step (10 substeps) runs in one dispatch: `step` in `forge-sim/src/metal/shaders/step.metal:154`, `step_worlds` in `forge-sim/src/wgsl/shaders/step.wgsl:174`.
- Each world compacts its own live rows.

The GPU loop (F5, `forge-train/src/gpu_loop/`) keeps physics, task, policy and PPO in one Metal buffer.

## 1. Batches of different robots

### What Steel does

- **Groups articulations by size.** `_setup_size_grouping` (`steel/solver_steel.py:4719`) sorts articulations by their response DOF count. Each group gets buffers of exactly its size, so nothing is padded inside a group, and kernels compiled for that size.
  - Each group gets its own launches (`_advance`, `solver_steel.py:7146-7210`), optionally on its own CUDA stream (`:7387-7406`).
  - The kernel is chosen by size:
    - a thread per articulation at 12 DOF or fewer;
    - tiled Cholesky above that;
    - a fused CRBA and Cholesky, one warp per articulation, up to 64 DOF.
- **Pads at the world level.** The solve runs one 32-thread warp per world (`solver_steel.py:15184`).
  - The world's rows are `[world, 32]` dense rows plus `[world, 512]` free-body rows.
  - The rows are reserved with an atomic counter per world (`steel/kernels.py:73-91`), or with a sort and scan in deterministic mode.
- **Routes work every step.**
  - Each contact is classified as free-body, articulated or dropped (`kernels.py:4810-4996`).
  - Each world is classified for a local solve or the general sweep (`classify_local_solve_worlds`, `kernels.py:10352`).
  - A world with no rows returns at the top of the PGS kernel (`solver_steel.py:15666`).
  - A lone free body gets a 6×6 inverse inertia instead of a factorization.

### Where Forge stands

- **One model per engine.** Forge already has the per-world parts:
  - live rows compacted per world (§8g, the Metal engine's Rows);
  - an early return when a world has no live rows (`solve_constraints`, `metal/shaders/newton.metal:119`);
  - worlds sorted by last contact count and Newton work before each control step (`group_order`, `forge-sim/src/gpu/pack.rs:122`).

  What it lacks is the group level: every `MetalBatch` and `WgslBatch` holds one compiled model.
- **Steel's grouping matters more for Forge than for Steel.** Steel gives each world its own warp, so worlds never share instructions. Forge runs 16 worlds in lockstep in one SIMD group.
  - Mixing robots inside one kernel would mean padding to the largest robot and losing the constants baked into the generated source.
  - It would also make the group wait for its slowest robot. Newton alone already costs 3.8 iterations per group against 1.62 per world.
  - So the borrowable idea is Steel's grouping key, not its padding: **group by compiled model, one kernel per group, all groups in one submission.**

### Borrowable ideas

**1a. Many tasks on one body in one GPU loop batch.** The AnythingZoo is 30 tasks on 6 bodies, and its reward search trains several candidate rewards per pair. Same body means same model, kernel and rows, so only the task differs.
- **How:**
  - Give each world a task index.
  - Have the task MSL switch on it: `task_reward`, `task_fell` and the observation for each task's `Code`.
  - Keep one parameter vector per task. The learner runs its GEMMs once per task over that task's rows, or as one batched GEMM.
  - Physics is untouched.
- **Files:**
  - `forge-sim/src/metal/task.rs` (emit per-task code behind an index);
  - `forge-sim/src/metal/shaders/task.metal`;
  - `forge-ir/src/task.rs` (a list of tasks per batch);
  - `forge-train/src/gpu_loop/{setup,buffers,rollout,learn}.rs`.
- **Expected gain (estimate):**
  - A control step for 1024 quad-servos takes about 70% of the time of 4096 (§8g, the Metal engine). The Kit trains at `gpuEnvs: 1024`.
  - So 4 candidate rewards of 1024 robots in one 4096 batch cost about 1.4× one job, not 4×: about 2.8× the reward-search throughput per pair.
  - Each task adds its own update phase. At 4096 robots and a 4-step horizon, one update is about 33 ms.
- **Parity risk:** none to the physics. Worlds stay independent, and `--batch-identity` already checks that a world's result ignores its neighbours. Each task's policy still replays in C MuJoCo (L5).
- **Step:** F5.

**1b. Several bodies in one command buffer.** For pairs on different bodies, or for a Cases world with two robots in separate worlds:
- **How:**
  - Keep one `Engine` per model.
  - Encode every model's `step` into one command buffer with a concurrent compute encoder, or one encoder per model on the same queue, and wait once.
  - Today `Gpu::run` (`forge-metal/src/mac.rs:126`) opens one serial encoder and waits on every call, and each `forge-train` process has its own device and queue.
- **Files:** `forge-metal/src/mac.rs` (a concurrent dispatch mode and a multi-engine `run`), `forge-sim/src/metal/batch.rs`.
- **Expected gain (estimate):** at small batches the step is pure latency (64 worlds take about 40 ms per control step on WGSL and 29 ms on Metal), so 6 bodies at 64 worlds each could step in about the time of one instead of six. At 4096 worlds the GPU is already 97% busy, so the gain is nothing.
- **Parity risk:** none. Every kernel is unchanged.
- **Step:** F4 for the engine, F5 for a loop that trains several jobs.

**1c. Design sweeps that change shape.** Per-world tables already sweep mass, friction, servo gains and gear on every engine, and damping, armature and frictionloss on SIMD (F7).
- **Different topologies:** a sweep that changes topology (a leg with one more joint) becomes another group under 1b, not a padded world.
- **Changed lengths:** a sweep that changes link lengths (`body_pos`, geom sizes) could join the tables, but only for fields C MuJoCo's batch can also expand per world. Otherwise the oracle and the engine simulate different things.
  - Neither reruns `mj_setConst`, so `invweight0` and `dampratio` gains stay at the base design's values. That is MuJoCo's semantics, and Forge must keep it.
- **Files:** `forge-sim/src/tables.rs`, `forge-sim/src/world_params.rs`, `forge-sim/src/gpu/tables.rs`.
- **Gain:** a sweep runs as one job instead of one job per variant.
- **Parity risk:** low when the C side expands the same fields.
- **Step:** F7.

**Not borrowable:** atomic row reservation. Forge's fixed slots per contact pair make the row order deterministic, and batch identity is bit-for-bit. Steel's default `atomic_add` slots let thread scheduling set the Gauss-Seidel order (`kernels.py:62-67`). Steel only gets run-to-run determinism through a sort and a scan.

## 2. Factorization reuse and sleeping

### Factorization reuse in Steel

- Each articulation's H is factored once per step.
- Each constraint row stores `Y = H⁻¹Jᵀ`, computed once per step by forward and back substitution (`hinv_jt_par_row`, `kernels.py:7616-7680`).
- Each PGS row update is a warp-reduced `J·v` followed by `v += Y·Δλ`.
- No Delassus matrix is ever built (`solver_steel.py:1369-1372`).
- The browser port goes further:
  - one articulated-body (Featherstone) factorization per substep;
  - a 6×6 response per contact-bearing link;
  - accumulated impulses pushed through the tree once per sweep (`webgpu/artwgsl.js:427-510`, `webgpu/wgsl.js:3254-3394`).

### Factorizations in a Forge substep

On the Metal and WGSL engines, a substep factors:
1. M after CRB (`step.metal`, `forward_upto`);
2. the Newton Hessian `H = M + JᵀDJ` when the solve starts;
3. H again after every iteration whose active set changed (`sv.dirty`, `rows.metal:11`; `hessian`, `newton.metal:20`);
4. `M − dt·diag(qDeriv)` for implicitfast (`implicit_step`, `step.metal:122`).

All are in f32 in threadgroup memory (`factor_h`, `inertia.metal:83`).

C MuJoCo instead updates the Newton Hessian's Cholesky by rank-1 steps when a few rows change state. Forge rebuilds it (§8g, what differs from MuJoCo).

### Borrowable ideas

**2a. Reuse M's factorization inside Newton.** Precompute each live row's `Y = M⁻¹Jᵀ` once per substep from the factorization of M that step 1 already did, as Steel does with H. With k active rows:
- **Few rows:** when k is small, the Newton direction `H⁻¹g` comes from the Woodbury identity, `M⁻¹g − Y(D⁻¹ + JY)⁻¹Yᵀg`.
- **Factor cost:** only the k×k matrix is factored, and only when the active set changes.
- **Dense fallback:** when k exceeds nv, keep today's path.
- **What it keeps:**
  - The Hessian only shapes the search direction. The gradient, costs, line search and stopping tests stay double-float and unchanged.
  - So Newton still stops on MuJoCo's tolerances, exactly as when the Hessian moved to f32.
  - The cheaper alternative is C MuJoCo's own rank-1 update, which is closer to the oracle's arithmetic.
- **Files:** `forge-sim/src/metal/shaders/newton.metal`, `rows.metal`, `inertia.metal`, their WGSL twins (`newton.wgsl`, `h_shared.wgsl`, `h_device.wgsl`), and `forge-sim/src/newton.rs` for SIMD.
- **Expected gain (estimate):** on quad-servo at 4096 worlds, "first Hessian" is 0.24 ms and the remaining Newton iterations 1.06 ms of a 2.5 ms substep. Factorizations are perhaps a third of each, so the ceiling is 10–15% of a substep. It's less where a foot's contact couples a whole leg chain anyway.
- **Parity risk:** low. It moves qacc within the Newton tolerance, not past it. L1 is the field to watch: it already sits at 6.7e-5 against a bar of 1e-3 after the f32 Hessian.
- **Step:** F4, then F6.

**Not borrowable from this section:**
- Steel's `update_mass_matrix_interval` (reusing H across steps) and `reuse_kinematics`. The first changes the dynamics. The second saves nothing in Forge, because the GPU loop's observations and rewards read the state rows, not body poses (`state.bodies` is refused on the GPU).
- The Featherstone impulse propagation. It solves PGS's problem, not Newton's.

### Sleeping in Steel

- **Islands:** a GPU union-find over articulations joined by contacts (`steel/sleeping.py:644-821`).
- **Sleep test:** an island sleeps after 0.5 s below 0.05 m/s and 0.15 rad/s, and only when supported by static geometry.
- **What it skips:** its dynamics and rows.
- **Vetoes:** driven articulations (nonzero drive stiffness or damping) never sleep.
- **Default:** off, and marked experimental.

**2b. Sleeping, only as MuJoCo's own.** C MuJoCo 4.0 has island sleeping:
- the `mjENBL_SLEEP` enable bit;
- `opt.sleep_tolerance`;
- `mjMINAWAKE` (10 steps);
- `tree_sleep_policy` per tree (`mjmodel.h`, `mjtype.h:88, 481`).

`forge-ir` refuses it today (`forge-ir/src/refuse.rs:47`). Steel's thresholds and support rules differ from MuJoCo's, so copying them would break L3 and L4 the moment anything slept.

- **What it would buy:**
  - **Training:** close to nothing. Training robots are actuated, move, and reset every episode, and Steel itself keeps driven articulations awake. A Stand policy under action noise never settles below tolerance for 10 steps.
  - **Elsewhere:** it pays only in scenes of many resting free objects. Forge can't simulate those yet, since contacts between two moving bodies are refused.
- **Files:** `forge-ir/src/refuse.rs` (admit the bit), the engines' step kernels.
- **Parity risk:** high unless it follows MuJoCo's island and wake rules exactly.
- **Step:** none of F4–F7. Revisit when hull-hull contact lands.

## 3. steel-webgpu against F6

### How steel-webgpu works

- **One scene, not a batch of worlds.** No kernel has a world dimension (`webgpu/sim.js:245-255`).
- **Eight dispatches per substep:** shapes, broadphase, indirect args, narrowphase, two sort stages, `prepare`, `solve`.
  - `prepare` and `solve` each run as a single workgroup of up to 1024 and 256 invocations (`wgsl.js:1787`, `wgsl.js:3633`).
  - All PGS iterations and colours loop inside that one workgroup, with `workgroupBarrier()` between colours. Body velocities stay in workgroup memory (`wgsl.js:2504-2506`, `3558-3565`, `3700`).
  - All substeps of a frame go in one compute pass and one submit (`sim.js:681-701`).
- **Colouring:** greedy first-fit, done on the GPU every substep, serially on one thread (`wgsl.js:1258-1267`).
- **Precision:** f32 only, with no compensated arithmetic.
- **Limits:**
  - It raises device limits rather than living within the defaults: up to 10 storage buffers, the adapter's full workgroup storage, 1024 invocations per workgroup (`webgpu/device.js:6-27`).
  - `prepare` can't fit the default 16 KB of workgroup memory.
  - The layout is 15 storage buffers, with a bind group layout per kernel that lists only the buffers that kernel uses.
- **Static tables:** packed into two storage buffers with offsets baked into the WGSL as `const`, which is the same choice F6 made.
- **Optional features:** subgroups (`subgroupAdd`, `subgroupMax`, inclusive and exclusive scans when 32 wide) and `timestamp-query` around the pass, each with a fallback.
- **Pipeline cache:** compiled pipelines are cached per device, keyed by the source (`sim.js:533-541`).
- **No speed numbers:** the repo reports none. Its HUD shows `gpuFrameMs` from the timestamps.

### Where F6 is already ahead for training

- It batches thousands of worlds.
- It packs a whole control step of 10 substeps into one dispatch, not 8 per substep.
- It fits the default 8 storage buffers: 7 storage and 1 uniform (`src/forge/forgeGpu.ts`).
- It moves the Hessian to device memory when workgroup storage is short, rather than requiring a desktop adapter.
- It meets L0 through double-float arithmetic with pins against fast math.

Steel-webgpu's f32 would fail L0 by orders of magnitude (§8g: f32 leaves 1e-7 where L0 wants 5e-9).

### What limits a tab today

The F6 gate measured Stand passing the Kit's Arena in 135 s from the call, at about 1,100 steps/s with 64 robots on the M5 Pro.
- **Physics latency:** a 64-world control step takes about 40 ms because one thread walks one world's whole serial chain.
- **The learner:** single-threaded WASM.
- **The round trip:** each control step writes and reads back the state rows (`ForgeGpu.run`, `forgeGpu.ts:160`), because the policy runs on the CPU.
- **Slower GPUs:** a 15-minute bar is about a GPU 6× slower than the M5 Pro's, or a browser that also loses JSPI time.

### Borrowable ideas

**3a. Time the GPU separately in the tab.** Request `timestamp-query` when the adapter has it, write timestamps at the start and end of the step pass, and report GPU time beside wall time.
- **Why:** this shows how much of the 40 ms is the kernel and how much is the JSPI suspension, `mapAsync` and the WASM learner. Every later choice depends on it.
- **Files:** `src/forge/forgeGpu.ts` (`open`, `run`), `forge-train/src/physics_host.rs` (phase times are 0 on wasm today).
- **Gain:** none directly. It is the measurement the others need.
- **Parity risk:** none.
- **Step:** F6.

**3b. A SIMD group or workgroup per world, for small batches.** This is the lesson that matters most, and steel-webgpu shows it two ways:
- Its whole scene shares one wide workgroup.
- Its dense rows give each articulation a 32-lane subgroup, with DOFs strided over lanes and `subgroupAdd` for the dot products (`wgsl.js:3300-3378`). Newton's Steel solve does the same with a warp per world.

Forge's thread per world is right for 4096 worlds and wrong for 64, where most of the GPU idles while each world's serial chain runs.
- **How:** give each world 8–32 lanes:
  - lanes split the DOFs in the vector loops (`dotv`, `mul_sym`, the residuals, `jac_mul`, `jac_t_mul`) and the rows in `update_rows` and the line search;
  - kinematics, CRB and the tree factorization run one lane per independent subtree (quad-servo's four legs) and synchronize at the root;
  - reductions use subgroup operations where present, and a fixed-order workgroup tree otherwise.
- **Files:** every shader in `forge-sim/src/metal/shaders/` and `forge-sim/src/wgsl/shaders/`, `forge-sim/src/gpu/layout.rs` (blocking by world instead of by 16 worlds), `forge-sim/src/metal/engine.rs` and `wgsl/engine.rs` (dispatch shape), and `forgeGpu.ts` (request `subgroups` and the adapter's `maxComputeInvocationsPerWorkgroup`).
- **Expected gain (estimate):**
  - The 64-world control step is latency-bound, so it would shrink by roughly the parallel fraction of a world's chain. That's perhaps 3–5× on quad-servo, whose 18 DOF and 4 legs give little more width than that.
  - It also removes the divergence tax on Newton, where a group of 16 worlds waits for its slowest (§8g).
  - In the tab that's about 1,100 toward 3,000–5,000 steps/s, if the learner keeps up.
  - It would also lift SHAC (§8g: 64 robots, latency-bound at 29 ms per control step) and the Kit's 1024-robot jobs.
  - At 4096 worlds it could lose: it trades parallel worlds for parallel lanes, and Forge's coalesced 16-world blocks.
  - So keep both layouts, chosen by batch size.
- **Parity risk:** moderate.
  - Parallel reductions change the association of double-float sums. L0 depends on the tree sums matching term for term (§8g, the WGSL engine).
  - A fixed-order reduction keeps runs deterministic and batch identity intact, because each world is still computed alone. But L0–L3 must be re-earned on the 200 fuzzed robots.
  - Prototype it on Newton's vector loops first: that's where the time is (1.06 of 2.5 ms), and they sit after the L0 fields.
- **Step:** F4 first, where the profiler (`metal_stages`) exists, then F6.

**3c. Request the adapter's limits and optional features, with fallbacks.**
- **Already:** F6 asks for the adapter's workgroup storage.
- **To add:** request `subgroups` when `subgroupMaxSize ≥ 32`, and `maxComputeInvocationsPerWorkgroup` up to 1024. Both are needed only for 3b. Keep the paths that work on default limits, as steel-webgpu keeps a serial fallback for every subgroup use.
- **File:** `src/forge/forgeGpu.ts`.
- **Gain:** enables 3b.
- **Parity risk:** none, as long as qualification (`wgsl/qualify.rs`) runs on the device the job will use.
- **Step:** F6.

**3d. Keep the state rows on the GPU between control steps, later.** steel-webgpu never reads back for rendering: it copies poses GPU to GPU (`three/poseBridge.ts`).
- **Forge's equivalent:** port F5's task and policy kernels to WGSL so a tab's rollout never leaves the GPU.
- **When it matters:** only once 3b makes the kernel short enough for the round trip to show. Check with 3a first.
- **Files:** a WGSL twin of `forge-train/src/gpu_loop/` and `forge-sim/src/metal/task.rs`.
- **Parity risk:** the GPU loop's learner qualification and L4/L5 already cover this on Metal and would carry over.
- **Step:** F6, after F5.

**Not borrowable:**
- f32-only physics.
- One workgroup per scene, which caps at 256 articulations and one world.
- Serial thread-0 colouring.
- All-pairs broadphase. Forge's contact pairs are fixed at compile time.
- Steel-webgpu's requirement of desktop limits. F6's Hessian-in-device-memory fallback is the better rule for laptops.

## 4. Formulation: where Steel's ideas stop

Forge keeps one formulation, one model and one oracle: whatever Forge's own engines simulate must be what C MuJoCo 4.0 simulates. These parts of Steel solve a different problem and can't cross without failing L0–L5:

| Steel | MuJoCo, and Forge | What borrowing it would break |
|---|---|---|
| Velocity-level PGS, 12 iterations, early exit on an exactly stationary sweep | Newton on MuJoCo's convex primal, stopping on its tolerance (1e-8) and line search | L1 at once: PGS stops at a different, iteration-count-dependent point. Steel's "local solve" shortcuts are PGS shortcuts too |
| Baumgarte 0.2, CFM 1e-6, speculative `φ/dt` for open gaps | solref and solimp impedance, regularization R, margin and gap | Contact force at every step (L1), and the gate's contact counts wherever a speculative contact fires before MuJoCo's margin. MuJoCo 4.0 has its own speculative contacts (an enable bit `forge-ir` refuses); borrow that semantics if ever, not Steel's |
| Circular friction disk per contact, friction patches with anchors | Pyramidal cone rows (condim 1 or 3); elliptic is refused | Tangential forces, so L1 and every rollout (L3). Anchors carry state across steps that MuJoCo doesn't have |
| Implicit PD drive: `ke·dt² + kd·dt` on H's diagonal | implicitfast: only velocity derivatives (`kv`, damping) go on the diagonal; `kp` stays explicit | Servo response, so L3 and the policies' behaviour (L4, L5) |
| Joint limits off by default; unilateral limit rows with Baumgarte | Limit rows with margins, solref and solimp | L1 at any limit |
| H refreshed every `update_mass_matrix_interval` steps | M recomputed every substep | L1 whenever the interval is above 1 |
| f32 everywhere; nondeterministic by default | double-float on GPUs, f64 on SIMD; bit-for-bit batch identity | L0 (5e-5 relative, floor 5e-9 absolute) and batch identity |
| Sleeping with Steel's thresholds | MuJoCo 4.0's own `mjENBL_SLEEP`, refused today | L3 the first time an island sleeps |

What does cross is everything about how the work is laid out, never what is computed:
- grouping by model;
- one submission for several groups;
- per-world routing and compaction;
- reusing a factorization the step already computed;
- lanes within a world;
- device limits and timing.

The test for any of these is the existing one: the 200 fuzzed robots at L0–L3, `--batch-identity`, qualification on the device, and the L4/L5 replays in C MuJoCo.

## Recommended changes, ranked

1. **Several tasks on one body in one GPU loop batch** (1a, F5). About 2.8× the AnythingZoo reward search at the Kit's 1024 robots (estimate), with no physics change and no parity risk.
2. **GPU timestamps in the tab** (3a, F6). Cheap. It shows whether a tab's time goes to the kernel, JSPI or the learner before anyone rewrites kernels.
3. **A SIMD group per world for small batches** (3b, with 3c; F4 then F6). The largest potential gain for the tab, SHAC and 64-robot jobs: perhaps 3–5× per control step (estimate). The largest job too, and L0–L3 must be re-earned. Start with Newton's vector loops on Metal.
4. **Several models in one command buffer** (1b, F4 and F5). For mixed bodies at small batches. No parity risk, and no gain at 4096 worlds.
5. **Reuse M's factorization in Newton**, through Woodbury on the active rows or C MuJoCo's rank-1 update (2a, F4 then F6). At most 10–15% of a substep (estimate), low risk; watch L1.
6. **Shape-changing design sweeps as groups** (1c, F7), only for fields C MuJoCo's batch also expands per world.
7. **Sleeping** (2b): not now. Only as MuJoCo 4.0's own `mjENBL_SLEEP`, and only once Forge simulates scenes with resting free objects.
