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

## Arena source lock after passive joints

Commit `9a8a02e26` changed one line in `arenaWorld.ts` to refuse servo draws for joints with actuator index below zero. The `s3a-motor-kit` source hash still named the previous file. Both named latency tests in `verify/lib/run.test.mjs` therefore failed their initial unmodified-tree assertion in run 43831610288. A direct invocation reproduced `Changed without a maintainer: src/skills/arenaWorld.ts`. `controlDelay.ts` had not changed. This is a deterministic source-pin regression, not two latency failures.

The repair retains the passive-joint guard, updates only its frozen source hash and the gate's own manifest hash, and adds real-MuJoCo coverage with passive damping 0.3 and a powered gain multiplier of two. Reverting the whole 87-file passive-joint merge would also remove behavior consumed by later lid and drawer work, so the repair fixes the source pin in place. No evidence threshold, count or runtime implementation changes. The existing source-mutation tests must still refuse changes to both latency files.

## Windows grouped recovery quarantine

[#1365](https://github.com/JamelHammoud/basecase/issues/1365) owns the Windows-only quarantine through 28 November 2026. Run 43831610288 observed one train-start instead of two after reload at line 75, then stalled clicking Concurrent attempts on retry. The same file passed both tests on Windows in run 43824172798 in 75.040 seconds, with unchanged training, worker and fixture code. Linux passed at the failing revision in 30.052 seconds. The earlier run 43820519938 alternated between zero initial dispatches and no reattachment. These observations do not identify whether model reconstruction, journal persistence, worker startup or reattachment stalled.

The single-attempt walkthrough stays active on Windows, and grouped recovery stays active on Linux and macOS. Restoring the grouped Windows walkthrough requires production-path traces and at least ten observations before and after at equal load, including parent and child identities, one remote dispatch, controlled local refusal and process cleanup. Repair makes no flake-rate or product-fix claim.

## Windows single-attempt recovery quarantine

[Nightly Check 43844795005](https://github.com/JamelHammoud/basecase/actions/runs/43844795005) also failed the single-attempt remote-training walkthrough on Windows. The first attempt observed zero initial train-start requests at line 26. Its automatic rerun stalled locating Connect at `configureRemoteComputer` line 111. The existing grouped quarantine under [#1365](https://github.com/JamelHammoud/basecase/issues/1365) already records absent initial dispatch and configuration stalls. The remote transport and browser fixture files did not change since the Windows pass in run 43824172798. The cause remains unestablished, including whether the second attempt reused configuration state left by the first.

Both remote-training browser walkthroughs are now quarantined on Windows through 28 November 2026 under that existing priority fix issue. Its follow-up records the single-attempt evidence and preserves the original restoration requirements. Both paths remain active on Linux and macOS. Controlled `seedWorkflows.test.ts`, `recoveredSkill.test.ts`, `seedSelection.test.ts` and remote transport tests retain cross-platform behavior coverage. The regular Windows browser run temporarily lacks Settings-to-dispatch-to-reload recovery. Restoration requires configuration, readiness, model preparation, dispatch, journal, reattachment and cleanup traces, with at least ten baseline and ten candidate Windows runs at equal load and retries disabled. Recovery identities, one remote dispatch, progress delivery, credential exclusion and the grouped local verdict stay asserted. Repair performed no local browser runs or repeated measurements.

## Remote group cancellation directory order

[Full Check 43906210676](https://github.com/JamelHammoud/basecase/actions/runs/43906210676) at `d91150aeea1b6596e48b9a651304ed7a6761e4ce` failed the Linux cancellation test while reading `remoteEntries[1].outcome.kind`. [Full green Check 43864963744](https://github.com/JamelHammoud/basecase/actions/runs/43864963744) at `6be4b9dd8d0e4cf9f0d9c7ceef80166365e36d03` passed the same four group cases on Linux and Windows. The test and remote training sources have no diff between those revisions. This is a flaky test assumption, not a regression introduced by an intervening merge.

Restoration enumerates job directories through `fs.readdirSync`, whose order need not match creation order. The parent IDs combine time with a random suffix, so even lexical order can differ when two parents start in the same millisecond. Index 1 can therefore identify the active parent with no outcome. The cancellation fixture now returns the cancelled parent first during restoration and checks both parents by their saved IDs. The cancelled parent must retain its error outcome, the active parent must remain unfinished and exactly three child dispatches must have occurred.

A single controlled reproduction with that directory order and the old positional assertion produced the identical TypeError. Its changed-file check log is `scratch/group-order-reproduction.log`. This establishes the cause without measuring a flake rate. Production queue and restoration behavior are unchanged. Current coverage remains in [Forge](../guide/forge.md#grouped-seeds).

## Duplicate remote recovery walkthrough

Issue [#1544](https://github.com/JamelHammoud/basecase/issues/1544) reported 43 s for the single-attempt browser walkthrough in [Check 43948835889](https://github.com/JamelHammoud/basecase/actions/runs/43948835889). It repeated the grouped walkthrough's Settings configuration, Stand start, scene save, reload and same-identity reattachment. The single-attempt walkthrough is deleted, along with its obsolete Windows quarantine entry. Reconnect status delivery and saved-scene credential exclusion now run in the remaining grouped walkthrough before completion. No timeout or retry changes.

`skillRecovery.test.ts` retains workflow persistence and restart identity. `trainerForgeRecovery.test.ts` retains stable Forge call identities across recreation. `electron/remoteTrainer.test.mjs` persists a single-attempt request, recreates the trainer, reattaches to the same job and asserts exactly one transport dispatch. These controlled tests cover the behavior without another browser launch, model reconstruction or reload.

There is no longer a dedicated single-attempt Settings-to-reload browser path. Grouped browser recovery remains quarantined on Windows under #1365 with its existing restoration conditions. Deletion does not establish the cause of those Windows stalls or restore that coverage. No local browser timing or flake-rate measurement was run. The reported 43 s is the removed observation, not a measured reduction for the remaining test.
