# Skills test evidence

Current coverage: [owning guide](../guide/skills.md#testing-coverage). Shared policy and harness contracts: [Running and testing](../guide/running-and-testing.md#0e-tests).

## Pose animation training

The Sit training and Try walkthrough in `e2e/skills.e2e.test.ts` was removed under [#1141](https://github.com/JamelHammoud/basecase/issues/1141) after taking 39 s in run 43739315274. It supplied a clock policy but still ran the move solver and Arena before checking playback.

The retained tests do not cover the complete Sit Train-to-Try sequence.

## Skill coaching

The coaching browser test in `e2e/skills.e2e.test.ts` previously ran three training and Arena cycles and took 44 s in run 43642970706 (#860).

## Training snapshots

The combined Stand snapshot sequence in `e2e/skills.e2e.test.ts` took 37.091 s on Windows and 30.138 s on Linux in run 43715791435 ([#1081](https://github.com/JamelHammoud/basecase/issues/1081)).

## Remote training recovery

Publication's tracked-file check rejected the transport fixture's hard-coded trainer home paths. The sshd image now creates the trainer account with `/srv/basecase-training` as its home. Authorized-key setup and detached-job PID assertions use that same home, preserving the remote runner's `$HOME` behavior without machine-specific home paths.

The workflow journal stores existing worker input, not executable continuations. Replaying the worker reruns local simulation and Arena, while a workflow id and call index return the same Forge stages. Model hashes and the animation and Case context bind the journal to the open scene. Retention checks that binding again after local judgment. Kit and tracking jobs carry an explicit workflow seed, because their previous fresh random seeds would change inputs during replay.

The focused tests control training and the Arena verdict to keep acceptance about transport and retention separate from learning time. They execute the real `runSkillsJob` and Kit path, including policy preparation, local proof, artifact creation and runtime retention. Recovered refusal retains no record even when the remote result claims readiness. Browser coverage controls the remote bridge and runs the normal worker until reattachment, before the result reaches local Arena. Native training and SSH transport are covered separately by the remote transport checks described in the Forge guide.

The journal covers Motor Kit work including warm starts, taught solver races, saved motions and frozen dataset cloning. It retains one foreground workflow per workspace. Grouped seeds extend that journal as described below. Hosted scheduling remains outside the runner. The journal has no SSH identity, host configuration or secret fields, and no scene serializer reads its database. Interrupted local training keeps its existing behavior.

Review reproduced an interrupted upload by emitting stdin `EPIPE` before the SSH exit callback. Passing that stream error directly to the observer made a network disconnect terminal. The observer now classifies the SSH exit, keeping host-key refusal terminal and connection reset recoverable. Another regression used an omitted workspace id to start overlapping remote jobs, and a different active workflow could swallow reattachment. Workspace normalization and identity checks prevent both.

The local and remote native processes share one queue. Focused queue coverage checks that remote dispatch waits for a yielded local Kit process to close, queued Stop stays stopped across backend recreation, and an active remote process reserves the queue before new local work. Earlier completed stages can replay while the same workflow's current stage runs. These checks use controlled processes and transport, with no native learning claim. The Linux sshd, CPU Forge and local Arena workflow and Windows client workflow supply platform execution coverage in CI.

A documentation capture exposed an IndexedDB `DataCloneError` before the first dispatch because the journal copied a runtime `work` callback. The journal now copies only row identity and label into its metadata. Its regression uses a callback-bearing runtime row with a clone-enforcing store. The completed capture configured the fixture computer, started Stand, reopened the saved scene and retained a locally checked result with the same remote call identity. It measured the UI and recovery path, not SSH throughput or learning time.

Training seeds alone did not make curriculum replay stable. Arena drew fresh held-out instances, and Kit validation drew fresh ranking samples. Either could select another candidate or failed start, changing a later job under an existing remote call identity. Recovery now commits a private random 32-byte judgment key alongside the worker request. The worker derives an ordered stream of local judgment salts from that key, using the existing optional Arena and validation salt inputs. Restoring the workflow reruns the same local judgments and therefore the same curriculum decisions. New workflows retain independent private draws. No judgment key or derived salt enters the Forge job, the returned policy or the scene.

The replay regression runs the real multi-candidate Kit worker twice against controlled Forge, Arena and validation boundaries. Rankings depend on the supplied private draws, Arena refuses all candidates, and the next curriculum stage must reuse the same chosen warm-start folder. Both executions produce equal complete Forge inputs and equal local judgment sequences. Missing salt propagation fails the regression rather than falling back to fresh random draws. Arena's existing tests retain the randomized-world and statistical-bar checks.

The remote recovery browser test failed twice in Linux Check while waiting 30 seconds for Try after the fixture emitted completion. The file took 115.734 seconds including its configured retry. Configuration, reload, stable recovery identity and reconnect progress passed before that wait. The test now ends at reattachment, and its unused policy-completion fixture routes are removed. `recoveredSkill.test.ts` covers successful local Arena retention, refusal despite a remote ready claim, and stale-design rejection through the real worker and runtime with controlled judgment boundaries. `recoveryJudgmentReplay.test.ts` covers curriculum replay and later Forge inputs. The browser walkthrough does not cover recovered Train-to-Try completion. No timeout, retry or acceptance bar changes.

Review found that a rejected journal deletion escaped the runtime's final cleanup, leaving its training row busy indefinitely. `recoveredSkill.test.ts` now injects that storage failure and checks row removal, private identity cleanup, refusal delivery and a subsequent job. `skillRecovery.test.ts` checks that failed deletion clears the active identity and judgment key. `trainerForgeRecovery.test.ts` delays the start response until after Stop or detach, then checks that only Stop reaches the newly created job. These checks use controlled storage and bridge promises, with no timing waits or native training.

The extracted move lifecycle originally captured its infrastructure error before the worker ran, so a connection failure returned only the generic training refusal. `runtimeMove.test.ts` introduces the error during the worker call and checks that the final refusal reads it afterward.

## Grouped remote seeds

The group extends the existing remote workflow journal and Forge runner. Child identities, input hashes and terminal outcomes remain on disk. Local development selection is acknowledged into the same parent journal before Arena. Identical replay is accepted, while another winner or changed selection evidence is refused. This prevents a restart from turning a failed local verdict into a search over the other children.

The selection tests use three policies to cover ordering, stable ties, a failed child and nonfinite evaluation. The workflow matrix runs quad and hexapod Stand, supplied warm starts, a taught Sit and rover velocity through the real solvers with controlled development and Arena boundaries. Grouped arm cloning goes through the existing Case training runtime and records all child work. Recovery tests use the real local nominal rollout and a controlled Arena verdict. These establish dispatch, selection and retention behavior, not learning success.

The rover matrix initially failed with `Training needs a powered joint.` Reward search used the position-only Kit builder for velocity-driven wheels. Wheeled velocity goals now consume the existing velocity action kind and powered-channel ordering, through `trainingJob`. Legged position policies keep their original action ordering.

The transport previously required `resume.json` for cloning, although Forge's BC path writes no PPO resume state. Cloning now verifies and downloads its policy without that artifact. The transport unit test covers policy-only completion alongside the existing corrupt-artifact refusal checks.

Review found that runtime recovery checked only files still present on disk. Removing either the executable or MuJoCo library let preparation silently omit it from the next child's manifest. The transport regression covers deletion and modification of each file, plus successful preparation from the frozen computer after deselection. Recovery checks every runtime hash before writing another child. Review also reproduced shell-dependent file limits: `ulimit -f 65536` set 64 MiB under this Mac's `sh` and 32 MiB under its `dash`. The Linux worker uses util-linux `prlimit` with an explicit 67,108,864-byte limit. Thread environment overrides apply only to grouped workers, preserving single-attempt inheritance.

The existing Linux transport fixture compares concurrency 1 and 2 with the same two seeds, aggregate eight iterations, eight environments and one requested physics thread per child. Both use C MuJoCo on the same sshd container. It reports end-to-end milliseconds through local Arena, actual reported training steps, sampled summed `/proc` VmHWM, threads and process peaks, remote disk usage and each local outcome. Its output line starts `Remote seed CPU comparison:`. Memory is sampled while processes are alive, so it is a lower bound on the simultaneous peak. Disk usage includes earlier fixture jobs. CPU affinity is inherited from one allowed CPU per worker slot, and a one-CPU container can map both slots to that CPU.

No local native timing is recorded for this change. This checkout has no staged Linux Forge bundle, and native execution remains in the existing Linux CI workflow. The comparison asserts equal actual training work and process caps, not speedup or a passing learned policy. Its emitted measurements are the source for any later timing claim. Cancellation through real stop files and the existing lost-acknowledgment recovery fixture run in that same workflow. Windows client coverage remains in the existing Windows job. No gate, retry policy or production test deadline was added.

The documentation capture configures two attempts through Settings and reloads after aggregate progress. It uses controlled remote events, and images are captured without visual judgment. Its initial scratch configuration lacked the browser harness's existing polling contract, so reload assertions expired before model reconstruction. Using that existing harness configuration completed the capture in 26.31 seconds. A later capture also consumed the controlled local verdict and passed in 23.10 seconds. These are unbundled browser and capture times, not remote training throughput. Real Arena execution remains in the integration and Linux transport checks.

## Passive robot joints

The existing action and observation contracts remain intact. The environment index retains all physical joint identities and a separate actuator set. Validation uses the actuator set only for actions. Jobs retain initialJoints for every physical coordinate, while defaultPose and joints describe controlled outputs and ctrlDefault follows actuator order. Empty action sets are refused. Existing subset admission and native fallback own accelerated backend support. No GPU parity or training-quality claim follows from the mapping tests.

`passiveChannels.test.ts` also checks interleaved and reordered actuator metadata, Motor Kit defaults, passive observations versus actions and live gait output. Legacy powered output is covered by the existing drive suites.

## Passive Arena source pin

[Check run 43820519938](https://github.com/JamelHammoud/basecase/actions/runs/43820519938) failed both freeze tests before either planted its mutation. `frozenJudges.run()` identified only `src/skills/arenaWorld.ts`. Commit `9a8a02e26` added `slot.actuator < 0` to its servo-randomization guard but left the Motor Kit hash at the pre-passive source. `src/sim/controlDelay.ts` had not drifted. The pin now names the source with that guard, and the manifest updates only the changed gate and test hashes. Mutation coverage and every gate bar remain unchanged. A whole-feature rollback would also remove the passive model and action-channel work used by the subsequent contact-fixture feature, so this repairs the pin directly. This source-integrity repair establishes no new training or robotics gate verdict.

## Windows grouped remote recovery

The grouped walkthrough is quarantined on Windows until 28 November 2026 under [#1365](https://github.com/JamelHammoud/basecase/issues/1365). Run 43820519938 at `017a5f2a7313ce68c18a51acc390cef00b7f2084` observed no initial start request at line 64 on its first attempt, then only the original request after reload at line 75 on its second. Linux passed at that revision. The single-attempt walkthrough also passed on Windows. Commit `212dbcd46` introduced grouped coverage after the last green full suite. No retained error distinguishes model preparation, worker initialization, journal persistence or reattachment. The fixture controls remote events and the final local verdict but leaves worker preparation real. Each attempt opens its own app.

`seedWorkflows.test.ts`, `recoveredSkill.test.ts` and `trainerForgeRecovery.test.ts` retain grouped selection, recovery, one local judgment and failure accounting coverage. The grouped browser walkthrough remains active on Linux and macOS. Restore Windows only after startup and cleanup traces establish the cause and at least ten before and ten after observations at equal load retain the parent and child identities, one dispatch and local refusal. No flake-rate measurement was performed in repair.

[Exact-revision diagnostic 43824076136](https://github.com/JamelHammoud/basecase/actions/runs/43824076136) selected the exact grouped recovery test at `017a5f2a7313ce68c18a51acc390cef00b7f2084`. Nine observations passed and observation 2 failed. It used ten independent one-worker Windows processes, retries and quarantine disabled, Node v26.13.0, four CPUs and Windows image `20261103.298.1`. This supplies same-revision Windows pass/fail evidence for quarantine, without claiming a recovery fix or equal-load before/after improvement.
