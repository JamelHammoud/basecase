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

The journal covers Motor Kit work including warm starts, taught solver races, saved motions and frozen dataset cloning. It retains one foreground workflow per workspace. Parallel seeds and hosted scheduling are outside this step. The journal has no SSH identity, host configuration or secret fields, and no scene serializer reads its database. Interrupted local training keeps its existing behavior.

Review reproduced an interrupted upload by emitting stdin `EPIPE` before the SSH exit callback. Passing that stream error directly to the observer made a network disconnect terminal. The observer now classifies the SSH exit, keeping host-key refusal terminal and connection reset recoverable. Another regression used an omitted workspace id to start overlapping remote jobs, and a different active workflow could swallow reattachment. Workspace normalization and identity checks prevent both.

The local and remote native processes share one queue. Focused queue coverage checks that remote dispatch waits for a yielded local Kit process to close, queued Stop stays stopped across backend recreation, and an active remote process reserves the queue before new local work. Earlier completed stages can replay while the same workflow's current stage runs. These checks use controlled processes and transport, with no native learning claim. The Linux sshd, CPU Forge and local Arena workflow and Windows client workflow supply platform execution coverage in CI.

A documentation capture exposed an IndexedDB `DataCloneError` before the first dispatch because the journal copied a runtime `work` callback. The journal now copies only row identity and label into its metadata. Its regression uses a callback-bearing runtime row with a clone-enforcing store. The completed capture configured the fixture computer, started Stand, reopened the saved scene and retained a locally checked result with the same remote call identity. It measured the UI and recovery path, not SSH throughput or learning time.

Training seeds alone did not make curriculum replay stable. Arena drew fresh held-out instances, and Kit validation drew fresh ranking samples. Either could select another candidate or failed start, changing a later job under an existing remote call identity. Recovery now commits a private random 32-byte judgment key alongside the worker request. The worker derives an ordered stream of local judgment salts from that key, using the existing optional Arena and validation salt inputs. Restoring the workflow reruns the same local judgments and therefore the same curriculum decisions. New workflows retain independent private draws. No judgment key or derived salt enters the Forge job, the returned policy or the scene.

The replay regression runs the real multi-candidate Kit worker twice against controlled Forge, Arena and validation boundaries. Rankings depend on the supplied private draws, Arena refuses all candidates, and the next curriculum stage must reuse the same chosen warm-start folder. Both executions produce equal complete Forge inputs and equal local judgment sequences. Missing salt propagation fails the regression rather than falling back to fresh random draws. Arena's existing tests retain the randomized-world and statistical-bar checks.

The remote recovery browser test failed twice in Linux Check while waiting 30 seconds for Try after the fixture emitted completion. The file took 115.734 seconds including its configured retry. Configuration, reload, stable recovery identity and reconnect progress passed before that wait. The test now ends at reattachment, and its unused policy-completion fixture routes are removed. `recoveredSkill.test.ts` covers successful local Arena retention, refusal despite a remote ready claim, and stale-design rejection through the real worker and runtime with controlled judgment boundaries. `recoveryJudgmentReplay.test.ts` covers curriculum replay and later Forge inputs. The browser walkthrough does not cover recovered Train-to-Try completion. No timeout, retry or acceptance bar changes.
