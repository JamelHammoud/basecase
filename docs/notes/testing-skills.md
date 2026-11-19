# Skills test evidence

Current coverage: [owning guide](../guide/skills.md#testing-coverage). Shared policy and harness contracts: [Running and testing](../guide/running-and-testing.md#0e-tests).

## Published skill refusal

Issue #1775 reports that “saves nothing when Arena refuses the result, and says how many tries passed” took 33 seconds in [Check run 44245137178](https://github.com/JamelHammoud/basecase/actions/runs/44245137178). The installation fixture supplied a high-gain policy and ran real hexapod Arena rollouts to obtain a refusal, with a 120-second test timeout. Its assertions checked an empty save list, refusal and a count-shaped string.

The regression now supplies one controlled Arena refusal, matching the neighboring successful installation test's boundary. Real publication, source-to-target mapping, MuJoCo feasibility, Motor Kit orchestration and artifact retention remain exercised. The assertion checks the exact worst count, 20 of 32 in the latency variant, and exactly one Arena call for the target hexapod. The per-test timeout is removed. This test proves refusal propagation and retention, not hexapod physics. `arena.test.ts` retains real WASM pass and failure judgments, with statistical thresholds and randomized draws covered separately. No production behavior, timeout configuration, retry or quarantine changes.

On the macOS worktree, the focused changed-file check ran all 12 `hubSkill.test.ts` cases successfully in 308 ms of Vitest duration. That first check failed formatting, which was then corrected. This local file duration and the reported 33-second CI test duration come from different hosts and workloads, so they do not establish a CI speedup ratio.

## Edited robot local sources

The desktop studio enables automatic local Stand reuse for floating legged models with three powered joints per leg and source-to-target leg counts 4 to 4, 6 to 6 and 6 to 5. First robots and other mappings retain the cold path. Controlled Forge and Arena results establish orchestration only. Native comparisons below qualify this limited scope, without a universal learning-speed claim.

The generated mapping matrix covers lengthened and shortened legs, widened hip spacing, torso mass, a fixed payload, changed limits, default stance, added and removed limbs, joint ordering and catalog STS3215 c001 to c018 replacements on quadruped, hexapod and biped fixtures. A biped reduced to one leg is classified as fixed and refuses reuse. The source list is scoped by its caller. Generated robot keys identify the first root joint, so adding or removing a root limb can change that key within one scene. Selection prefers a matching key but allows compatible references already in the scene.

The first candidate check ran 56 related files. It passed 306 assertions and failed six mappings because selection incorrectly treated a changed robot key as another scene. Removing that identity assumption left one refusal, the one-legged biped, which the test now checks as unsupported. These observations concern source selection, not learned outcomes. Subsequent focused results are retained in the task handoff.

On the available 18-core macOS host, Forge 0.1.0 with MuJoCo 4.0.0 trained the unedited quad-servo Stand through the production desktop Trainer and ordinary Motor Kit Arena path. Seed 3101 retained a skill in 127.9408 seconds, using one 120-second Forge input, 7,667,712 reported steps and one Arena decision. The Forge process took 120.3706 seconds. Initial load averages were 19.25, 14.95 and 17.03. This is one source preparation run, not a cold-versus-warm comparison.

A preliminary held-out lengthened-leg comparison uses seed 3102 on Metal. Both retained outcomes passed 32 of 32 in every Arena variant and again in a separate independent Arena run.

| Input | Retained seconds | Seconds through independent Arena | Reported training steps | Forge inputs | Arena attempts before retention |
| --- | ---: | ---: | ---: | --- | ---: |
| Cold | 148.7580 | 168.1350 | 7,544,832 | 2 minutes | 1 |
| Local warm | 298.1654 | 320.0611 | 13,541,376 | 15 seconds, then 4 minutes | 2 |

Each schedule retained one outcome from one completed fixture and seed. Cold passed its only training attempt. Warm failed its initial Arena decision before using the existing four-minute trial. The warm target retained source hash `9a1f05654e53f6598e58e93122237d0e600594177d67cca783ae5636f95543df`. The 15-second replacement added no trial or verifier pass to the schedule. The observed failed attempt used one of the ordinary trials.

The one-minute load was 40.07 before cold, 53.55 between cold and warm, and 62.25 after warm. These are unequal loaded conditions, not the required same-load comparison. One fixture and one seed cannot establish a pass rate or a useful median. The observed warm time was longer, so the remaining experiment was stopped rather than enabling a scope from this sample. The next widened-hip cold input had started. Its last recorded progress was 26.8414 seconds and 1,916,928 steps before cancellation. That interrupted input is excluded from the completed pair and retained as additional spent work, not a failed learned outcome.

The preliminary source callback parses a cached artifact string. Warm preparation took 58.2169 ms, including parsing, selection, hashing and mapping, but excluding the source file read and bridge transport. It cannot qualify the requested end-to-end loading measurement. Arena thresholds and independent verification remain unchanged. Raw events, complete outcomes, job inputs and the interruption record are retained through `scratch/task-handoff.json` for continuation, without publishing local artifact paths.

### One-minute input, native Metal observations

The retained implementation replaces only the first Stand input with one minute. Ordinary cold Stand starts with two minutes. Both keep the existing four-minute remaining trial, seeds, randomization and Arena thresholds. Source artifacts remain byte-for-byte unchanged. A poor warm result can consume the remaining ordinary trial, as the preliminary failure above demonstrates.

Measurements use the production desktop Trainer, Forge and `trainKitEntry`, with real generated models and the ordinary Arena retention boundary. The retention timer starts before metadata selection, the production `getSkill` file read, validation and mapping. It ends after the target artifact is saved. A separate independent Arena then judges each retained controller on its target environment. That additional verification is included in the second timing column below and is not added to the product schedule.

The Mac has 18 cores. These comparisons use Metal's default 1,024 environments, the same source per robot family and identical target fixture, seed and backend within each pair. Mode order reverses for the second seed. Only one measurement-owned Forge process runs at once. Other loop work shares the host, so instantaneous load is not controlled. Observed one-minute load ranged from 3.06 to 13.16 during the quadruped cohort and 5.27 to 28.72 during the hexapod cohort. Pairing and reversing order reduce order bias, but do not establish equal instantaneous host load.

The original quad source is the seed 3101 artifact above. The hexapod source uses seed 5200, retained in 130.6254 seconds and 5,406,720 training steps. Its Forge input took 121.6396 seconds. The hex source hash is `bd911781f81897c21650706ee014e965fe90d7adacfb3c8e28dd9bd0ddf732f2`. Each source used one two-minute input and one Arena decision. These one-time source costs are separate from edit timings and apply before either edit schedule. They are not charged repeatedly to warm targets.

| Family and edit | Seed | Cold retention seconds | Warm retention seconds | Cold through independent Arena | Warm through independent Arena | Cold steps | Warm steps |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Quad, lengthen legs | 4201 | 127.5722 | 68.9202 | 134.8076 | 77.9325 | 7,348,224 | 4,153,344 |
| Quad, shorten legs | 4201 | 127.0648 | 72.5979 | 133.6819 | 81.0250 | 7,544,832 | 4,104,192 |
| Quad, widen hips | 4201 | 127.5464 | 76.9175 | 134.2460 | 89.3452 | 7,323,648 | 4,128,768 |
| Quad, lengthen legs | 4202 | 129.9812 | 67.7737 | 138.7721 | 74.8984 | 7,176,192 | 4,153,344 |
| Quad, shorten legs | 4202 | 128.3431 | 74.9476 | 135.7250 | 85.5952 | 7,323,648 | 4,128,768 |
| Quad, widen hips | 4202 | 128.1407 | 70.0367 | 135.2105 | 80.4091 | 7,544,832 | 4,153,344 |
| Hex, lengthen legs | 5201 | 149.5298 | 69.6539 | 165.8445 | 78.3104 | 5,480,448 | 2,531,328 |
| Hex, remove limb | 5201 | 140.0472 | 68.3378 | 149.9521 | 82.4773 | 6,094,848 | 2,850,816 |
| Hex, lengthen legs | 5202 | 137.0896 | 84.0786 | 151.4802 | 105.6361 | 5,677,056 | 2,482,176 |
| Hex, remove limb | 5202 | 142.2969 | 76.2100 | 153.8507 | 90.8873 | 5,996,544 | 2,826,240 |

All 10 cold and 10 warm outcomes retained, with no failed attempt in this cohort. Every retained outcome also passed the separate independent Arena. Every schedule used one Forge input and one Arena decision before retention. Quad median retention fell from 127.8565 to 71.3173 seconds, and independent-inclusive median from 135.0090 to 80.7171 seconds. Hex medians were 141.1720 versus 72.9319 seconds and 152.6654 versus 86.6823 seconds respectively.

Quad cold and warm work totaled 44,261,376 and 24,821,760 reported training steps. Hex totals were 23,248,896 and 10,690,560. Summed edit retention clocks were 768.6484 versus 431.1936 seconds for quad, and 568.9635 versus 298.2803 for hex. Including separate independent verification, sums were 812.4431 versus 489.2055 and 621.1275 versus 357.3111. These totals include failed attempts, of which this cohort had none. The earlier 15-second failure and interrupted input remain reported separately, rather than disappearing from the experiment history.

A final-code preparation replay with real file reads matched every measured mapped-policy hash, including the six-to-five action and observation mapping. Final preparation medians and transport limits are in [Skills performance evidence](performance-skills.md#local-source-preparation). Native job inputs, source hashes, per-stage steps, Arena results and raw event logs remain referenced by the task handoff.

Ten pairs across two source policies give limited uncertainty coverage. All-passing small samples do not establish equal population pass rates. Mass, payload, servo, joint-limit and default-stance edits have generated mapping and orchestration coverage, not separate native learning comparisons. Added limbs, bipeds, other limb counts, branching, incompatible chain depths, camera and clock observations remain outside automatic reuse. Existing mapping can support some of those structural edits for explicit installation, but local activation does not extrapolate the timing result to them.

The fast acceptance checks also caught a sparse-array chain-depth admission bug and a non-native one-layer policy fixture. The mapper now refuses missing depths, and local preparation requires the existing native actor architecture. A biped default-stance fixture initially placed opposing joint offsets and failed real feasibility. The fixture now supplies a symmetric crouch and retains the successful training assertion. No feasibility or Arena threshold changed. Runtime coverage also proves that a passing physics-only Recheck makes no Forge request, while a failed Recheck can use the same warm retraining path. Backend coverage catches remote-selected Forge status masking an unavailable local Python runner. Separate local capability keeps that background request cold.

### Native CPU observations

The CPU comparison keeps the same retained Metal-trained source artifacts, normal Kit training and Arena paths. Each pair uses the same generated target and seed. Native Forge runs C MuJoCo with 64 environments and four requested physics threads. The learner retains its normal threading. Only the backend and physics-thread setting differ from the Metal cohort. Mode order reverses between seeds 6201 and 6202. One-minute host load ranged from 10.10 to 22.82, including other loop checks. The host was shared, not isolated.

| Family and edit | Seed | Cold retention seconds | Warm retention seconds | Cold through independent Arena | Warm through independent Arena | Cold steps | Warm steps |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Quad, lengthen legs | 6201 | 132.9248 | 71.0084 | 144.2925 | 81.6552 | 2,018,304 | 1,022,976 |
| Hex, remove limb | 6201 | 150.1282 | 74.2675 | 165.2191 | 85.4206 | 1,847,808 | 1,029,120 |
| Quad, lengthen legs | 6202 | 131.4714 | 74.4423 | 141.1759 | 95.4207 | 2,165,760 | 1,247,232 |
| Hex, remove limb | 6202 | 131.2795 | 68.4513 | 140.6637 | 75.8366 | 1,214,976 | 1,047,552 |

All four cold and four warm outcomes retained and independently passed. There were no failed trials in this CPU cohort. Every schedule consumed one Forge input and one Arena decision before retention, followed by the separately measured independent Arena. Median retention was 132.1981 seconds cold and 72.6380 warm. Independent-inclusive medians were 142.7342 and 83.5379 seconds. Total cold and warm training work was 7,246,848 and 4,346,880 steps. Summed retention clocks were 545.8038 and 288.1696 seconds, or 591.3512 and 338.3331 including independent verification. Median warm source preparation was 30.0845 ms, including real file IO.

An additional six-to-six CPU pair lengthens the hexapod's legs with seed 6301. Cold ran before warm, with the same source and backend settings.

| Input | Retention seconds | Seconds through independent Arena | Training steps | Forge inputs | Arena decisions before retention |
| --- | ---: | ---: | ---: | ---: | ---: |
| Cold | 142.6743 | 164.8531 | 1,359,360 | 1 | 1 |
| Warm | 71.1384 | 83.6673 | 875,520 | 1 | 1 |

Both retained and independently passed, with no failed trial. Warm preparation took 40.7473 ms. One-minute load moved from 10.60 before cold to 31.00 between modes, then 16.03 after warm. This single pair adds native CPU execution coverage for the six-to-six mapping. It does not establish its population success rate or remove the shared-load uncertainty. Across the two CPU cohorts and Metal cohorts, all 15 cold and 15 warm schedules retained, with no observed loss of retained outcomes under the same existing upper budgets.

These are macOS native CPU observations, not Windows or Linux execution or remote transport measurements. Cross-platform dispatch and frozen recovery are covered by controlled integration tests and CI. A remote computer's speed is not inferred from these timings. All schedules use the same existing upper budget, with the warm schedule spending one minute less on its first input. No saved minute is reallocated into another training run.

The documentation capture drove the existing Stand row and saved four states without judging their appearance. It passed in 40.28 seconds using controlled training and retention boundaries, not native learning. The initial leg-delete action left focus on the Inspect tab. Focusing the canvas before selecting and deleting fixed that action without changing assertions. Local development serving also hit the harness's existing 30-second navigation limit during dependency optimization. The scratch capture isolates its Vite cache and warms static imports before opening the app. No committed harness timeout, retry or test policy changed. Its first scratch config accidentally inherited the full browser include pattern and was stopped. The corrected config selects only the capture file. CI owns execution of the committed browser walkthrough.

The explicit changed-file check passed formatting, lint, documentation, types, all 304 site pages and 515 assertions in 76 related test files. A subsequent focused check after adding local-versus-remote capability and Recheck coverage passed 78 assertions across 17 related files. The copy report found zero added, changed or removed UI strings. Final documentation-only changes receive their own changed-file check. Preflight rechecking corrected Arena’s stale-skill explanation to qualify automatic Stand reuse and describe retraining after a failed Recheck. Its existing steps and twin screenshot remain accurate. Install Skill, publishing, teaching, design-agent, animation and remote-training articles retain accurate workflows, controls and screenshots and were left unchanged.

### Removed edited-robot browser walkthrough

The six unchanged help articles flagged by preflight were checked against the feature diff. `install-a-skill-from-hugging-face.md` still describes explicit installation, which retains its ordinary training budget and requires fresh target evidence. `publish-a-skill-to-hugging-face.md` still describes the same export files and controls. `teach-a-robot-a-skill.md` and `train-an-animation-as-a-move.md` describe taught and animation jobs, which do not use automatic local Stand selection. `the-design-agent.md` retains the same agent capabilities and controls. `train-on-another-computer.md` retains the same configuration, dispatch, restart and local Arena steps. Freezing a mapped Stand input changes recovery internals without changing those steps. Their labels and screenshots remain accurate, so none needs an edit.

Pull request #1568's Linux changed-browser Check failed both attempts at the leg-deletion assertion, before dispatching training. The supplied log reports 18 parts remaining instead of 16 at line 78. The file took 33,857 ms, including its configured retry. The aggregate Check failed because this browser job failed. The log does not establish why the requested three-part selection deleted only one part, or demonstrate a training defect.

The unreliable deletion walkthrough was removed rather than adding waits, retries or a weaker assertion. `localKitWorker.test.ts` retains the hexapod limb-removal case through real model generation, source mapping, MuJoCo feasibility and the production worker. It checks the dispatched policy, source hash, fresh target evidence, artifact saving and unchanged source. `localKitRuntime.test.ts` retains foreground and background dispatch, record retention, trial budgets and frozen recovery coverage. Forge and Arena outcomes are controlled in these tests. They do not cover the browser's scene deletion followed by the saved Stand row's Train button.

The focused `e2e/editedKit.e2e.test.ts` starts with an edited hexapod fixture and its source reference. It clicks Train in the saved Stand row, uses production source preparation through the ranking worker, and checks the mapped policy, one-minute initial input, fresh target artifact and unchanged source. Only training and retention are controlled. The test avoids canvas selection and deletion, without adding a wait, retry or timeout. CI owns browser execution, and this revision makes no browser speedup claim.

Review found that Recheck could start fallback training on an old model after an edit during source loading or Arena. Its design revision now stays fixed from the initial request through fallback training and snapshot retention. `localKitRuntime.test.ts` checks edits during preparation, source loading and Arena, plus Stop during Arena, and refuses both dispatch and retention after cancellation. The changed-file check passed 135 assertions in 28 related files, types, lint, formatting, documentation and 308 site pages. Browser tests were not run locally.

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

The grouped walkthrough was later deleted under #1545, as recorded below. Its quarantine entry is removed with the test. The historical observations do not establish a product defect or a flake rate.

## Windows single-attempt recovery quarantine

[Nightly Check 43844795005](https://github.com/JamelHammoud/basecase/actions/runs/43844795005) also failed the single-attempt remote-training walkthrough on Windows. The first attempt observed zero initial train-start requests at line 26. Its automatic rerun stalled locating Connect at `configureRemoteComputer` line 111. The existing grouped quarantine under [#1365](https://github.com/JamelHammoud/basecase/issues/1365) already records absent initial dispatch and configuration stalls. The remote transport and browser fixture files did not change since the Windows pass in run 43824172798. The cause remains unestablished, including whether the second attempt reused configuration state left by the first.

The remaining single-attempt browser walkthrough is quarantined on Windows through 28 November 2026 under that existing priority fix issue. Its follow-up records the single-attempt evidence and preserves its restoration requirements. That walkthrough remains active on Linux and macOS. Controlled `seedWorkflows.test.ts`, `recoveredSkill.test.ts`, `seedSelection.test.ts` and remote transport tests retain cross-platform behavior coverage. The regular Windows browser run temporarily lacks Settings-to-dispatch-to-reload recovery. Restoration requires configuration, readiness, model preparation, dispatch, journal, reattachment and cleanup traces, with at least ten baseline and ten candidate Windows runs at equal load and retries disabled. The remaining walkthrough retains recovery identities, one remote dispatch, progress delivery and credential exclusion. Grouped local verdict coverage remains in the focused recovery tests. Repair performed no local browser runs or repeated measurements.

## Remote group cancellation directory order

[Full Check 43906210676](https://github.com/JamelHammoud/basecase/actions/runs/43906210676) at `d91150aeea1b6596e48b9a651304ed7a6761e4ce` failed the Linux cancellation test while reading `remoteEntries[1].outcome.kind`. [Full green Check 43864963744](https://github.com/JamelHammoud/basecase/actions/runs/43864963744) at `6be4b9dd8d0e4cf9f0d9c7ceef80166365e36d03` passed the same four group cases on Linux and Windows. The test and remote training sources have no diff between those revisions. This is a flaky test assumption, not a regression introduced by an intervening merge.

Restoration enumerates job directories through `fs.readdirSync`, whose order need not match creation order. The parent IDs combine time with a random suffix, so even lexical order can differ when two parents start in the same millisecond. Index 1 can therefore identify the active parent with no outcome. The cancellation fixture now returns the cancelled parent first during restoration and checks both parents by their saved IDs. The cancelled parent must retain its error outcome, the active parent must remain unfinished and exactly three child dispatches must have occurred.

A single controlled reproduction with that directory order and the old positional assertion produced the identical TypeError. Its changed-file check log is `scratch/group-order-reproduction.log`. This establishes the cause without measuring a flake rate. Production queue and restoration behavior are unchanged. Current coverage remains in [Forge](../guide/forge.md#grouped-seeds).

## Delete the duplicate grouped recovery walkthrough

[#1545](https://github.com/JamelHammoud/basecase/issues/1545) reports 67 seconds for `configures two attempts, recovers one grouped workflow and shows its local verdict` in [Check 43948835889](https://github.com/JamelHammoud/basecase/actions/runs/43948835889). This is the reported CI duration, not a local reproduction or a measured speedup. The test repeated Settings, Stand startup, scene saving and reload from the single-attempt walkthrough. Its child identities were generated by the browser fixture, and its worker interception injected the local refusal rather than running Arena.

The duplicate test, its Windows quarantine entry and its unused child, completion, policy-download and verdict fixtures are deleted. No production code, timeout or retry changes. The remaining browser test still drives Settings, starts Stand, restores its call identity, receives reconnect progress and checks credential exclusion. Its existing Windows quarantine under #1365 stays in place. There is no grouped Settings-to-verdict browser coverage after this deletion.

`electron/remoteTraining/group.test.mjs` checks real parent and child journal identities, restart without duplicate dispatch, frozen concurrency, completed-child replay, uncertain dispatch and cancellation. `src/skills/recoveredSkill.test.ts` runs the real worker and runtime with controlled Forge and Arena boundaries, checking grouped provenance, one Arena decision and preservation of the previous skill on refusal. `seedSelection.test.ts` and `seedWorkflows.test.ts` retain selection and terminal refusal coverage. These focused tests cover the behavior the deleted fixture only simulated. No native training throughput or Windows recovery fix is claimed.

## Shorten the surviving remote recovery walkthrough

[#1544](https://github.com/JamelHammoud/basecase/issues/1544) cites [Check 43948835889](https://github.com/JamelHammoud/basecase/actions/runs/43948835889). The raw job log reports 42,887 ms for the single-attempt test in the Windows quarantine job and 14,934 ms in the regular Linux shard. Windows studio startup took 1,562 ms. The log contains no stage timings after startup, so it does not establish which remaining stage accounts for the Windows difference.

The surviving test keeps Settings configuration, Stand dispatch, reload, equal recovery keys, one unique dispatch, reconnect progress and credential exclusion. It loads the same quadruped before configuring Settings, allowing model preparation to overlap those UI actions. Rename Scene remains necessary to trigger autosave after loading a new scene baseline. A saved-name assertion before reload verifies persistence. The robot, real skill worker, journal and remote event boundary stay unchanged.

This preserves the browser coverage left by #1547 instead of repeating #1549's opposing deletion. The existing Windows quarantine and its #1365 restoration conditions remain unchanged. No local browser run or candidate timing was collected, and no measured speedup or Windows recovery fix is claimed. Fast changed-file checks cover formatting, lint, documentation and types. CI owns browser execution and candidate duration.


The first candidate failed Linux changed-browser Check twice at the saved-parts assertion. The supplied log reports 74,460 ms for the file, including its configured retry, with studio startups of 34,809 ms and 1,984 ms. Removing Rename Scene removed the edit that triggered persistence. `__studio.load` assigns a fresh scene id, and `useAutosave` treats that id change as a saved baseline without writing it. The revision restores the existing rename actions and expects `Remote quadruped`, while retaining the earlier robot load. The aggregate Check failed because this browser job failed. No timeout, retry or assertion was loosened. Browser verification and candidate timing remain with CI.
## Windows installed OpenSSH probe deadline

[Check 44386066760](https://github.com/JamelHammoud/basecase/actions/runs/44386066760) at `8211a6295c8509a8e3ab4d78f64bba8265b1d9a9` exhausted the unchanged 5,000 ms deadline at 5,012 ms in `electron/remoteTraining/config.test.mjs`, `training SSH boundary > spawns the installed OpenSSH client without a shell on this platform`. The test calls `runSsh` with `-V` and empty stdin. The other thirteen configuration cases passed. The failed log establishes callback entry and deadline expiry, without distinguishing executable lookup, spawn, stdin handling, native OpenSSH execution or callback delivery.

Last full green [Check 44245137178](https://github.com/JamelHammoud/basecase/actions/runs/44245137178) at `38217ff66d93565c46b38e74abcdbf4be8bb39a0` passed the Windows probe in 1,301 ms. Configuration, executable lookup and test sources, the lockfile and unit configuration are unchanged. Both full jobs used image `20261103.298.1`. Linux passed the failed revision's entire configuration file in 70 ms. No causative intervening merge or changed environment component is established.

Exact-revision [Windows diagnostic 44387897125](https://github.com/JamelHammoud/basecase/actions/runs/44387897125), ticket `153d0bfb-f90a-4875-bfa0-ca319eccba7c`, passed the complete probe in 3,727.9397 ms. Its process took 4,327 ms with no cleanup errors. The verified manifest records Windows x64, Node v26.13.0, four CPUs, one worker, zero retries and quarantine off. The diagnostic used newer image `20261116.315.1`. This is a same-revision pass establishing intermittent execution across the observed Windows environments, not an equal-image or equal-load comparison, a rate measurement or proof that the image caused the failure.

Only this exact probe is quarantined on Windows through 28 November 2026 under open priority owner [#1819](https://github.com/JamelHammoud/basecase/issues/1819), labelled `loop:fix`, `loop:next` and `loop:priority`. Windows retains the other thirteen configuration checks, including host-key pinning, argument boundaries, hostile hosts and users and interrupted-upload classification, plus remote trainer, transport, bundle and selection tests. Linux and macOS retain the installed-client probe, and Linux retains real sshd transport acceptance. Those checks do not replace Windows installed-client execution. The browser recovery investigation remains separately owned by #1365.

Restoration requires tracing lookup, native spawn, input, output and completion, fixing the established cause and ten baseline and ten candidate Windows observations at equal load with retries disabled. Preserve shell-free native executable selection and all transport boundary assertions. Do not increase deadlines, add retries or assume that a faster mock proves installed OpenSSH compatibility. This repair changes no transport code or assertion. Source logs and collected manifests, reports and cleanup logs are referenced in `scratch/task-handoff.json`.


## Obstacle-aware arm planning

Implementation: [Skills](../guide/skills.md#obstacle-aware-arm-candidates). Comparative work, timing, memory and cancellation observations are in [performance evidence](performance-skills.md#obstacle-aware-arm-planning).

### Production matrix and negative controls

`armPlanningMatrix.test.ts` generates divider, column, shelf, cabinet, bins, parked-arm, base-fold, long-tool, asymmetric and narrow-passage requests through the production draft and solver race. Each positive case runs eight real development trials and all 96 Arena tries, saves ordinary Skill JSON and reads it through the bundle reader. All ten generated requests use seven seconds, a 5 mm contract tolerance, a 0.5-second dwell within the final two seconds and a one-second endpoint hold. The geometry, initial and target configurations, limits, physical timesteps and five-second test deadline are unchanged from the initial ten-second fixtures. The shorter requests require faster tracking. Ten-second prompt, rotated-fixture, browser and native replay cases remain.

A separate uninflated MuJoCo engine samples 501 configurations per animation segment, including endpoints. It checks finite commands, authored limits, increasing times, no penetrating contacts and unchanged parked controls. Physical development trials inspect actual coordinates after every integration step. A 1,001-state comparison checks clearance certificates against fresh collision queries, including parked descendants, forbidden contact, jumps and nonfinite input.

Independent negative controls cover enclosed targets, colliding starts, insufficient clearance, forbidden self-contact, joint-limit obstruction and inadequate actuator tracking. They assert no retained skill and no false geometric-impossibility claim. The weak-actuator control keeps a clear geometric candidate while physical validation refuses all eight draws.

`configurationSearch.test.ts` covers seeds, wrapping, direct paths, bounded exhaustion, cancellation and timed corner shortening. Its timing case independently checks 1,001 points per returned transition. `armConfiguration.test.ts` covers chain ancestry, parked branches, authored contact exclusions, source provenance and unsupported models. `armPlanningLifecycle.test.ts` checks deterministic endpoint-to-controller results and Stop or edits during active production search. `runtimeRace.test.ts` checks save, retention and stale-result boundaries.

### Reference physics and browser entry

`armMotionReplay.test.ts` replays searched divider and rotated-column controllers in C MuJoCo and WASM. Contacts must match and state drift remains below the existing 1e-6 tolerance. Both replays retain ten-second controllers.

`e2e/armPlanning.e2e.test.ts` requests an obstructed reach through the existing Skills prompt, hands off through recorded agent tool calls with real planning and Arena, reads the result row and presses Try. It observes the body poses used by the renderer, checks the declared target around the divider, saves and reopens the ordinary scene and exercises a bounded refusal with empty app errors. It changes no recording paths or quarantine entries.

Review found that the target wait and the 25 ms observation timer read poses independently. The wait could succeed before the timer recorded arrival, leaving the final sample outside the unchanged 5 mm assertion. The successful target callback now records that pose and clears the timer before returning. This removes that scheduling race without changing the target, tolerance, path assertions or deadline. Browser execution of this correction belongs to CI.

The current-main browser capture passed in 41.38 seconds through reach, refusal and save/reopen using the harness's development-server fallback. Screenshots were saved outside the served public tree until the browser closed, preventing capture writes from triggering a development reload. Source and result are `scratch/arm-capture.test.ts` and `scratch/arm-capture-current-main.log`. Navigation observations are in `scratch/arm-capture-network.json`. The final source capture passed the same complete workflow in 41.07 seconds, recorded in `scratch/arm-capture-final-acceptance.log`. Its app error list was empty. The development harness printed a two-server teardown warning and exited with status 0, leaving no capture server running.

### Normal-concurrency acceptance

The first complete related selection after timed corner refinement and seven-second generated requests passed formatting, lint, docs, all 346 site pages, types and 2,045 tests. One existing file and test were skipped. The run used normal concurrency and unchanged five-second test deadlines across 314 selected files. Vitest took 43.90 seconds. Evidence is `scratch/check-empty-contacts-full.log`. The final bounded local-cost implementation then passed the same 2,045 tests at normal concurrency in 44.04 seconds, again with one existing skip. Its exact log is `scratch/check-final-acceptance.log`.

The six-second probe honestly refused four requests at the existing command-speed bound. The seven-second matrix retains every geometric, tracking, dwell, trial-count and retention assertion. It does not claim a speedup for the original ten-second computational workload. No timeout, retry, worker override, quarantine or merge gate was added.

### Earlier failure evidence

Closed attempt #1837 passed 2,029 related tests with one local worker but still exceeded five-second shelf and cabinet deadlines under normal concurrency. That serial pass did not establish steady acceptance. Later ten-second retained-work selections also exceeded deadlines. On main at `23297fb72`, shelf took 5,253 ms, cabinet 7,062 ms and bins 5,889 ms while 2,041 other tests passed. Logs include `scratch/check-current-main.log`, `scratch/check-solver-all.log` and `scratch/check-final.log`.

A general native-box emission experiment caused existing rover Push in Block and league replay failures without resolving arm deadlines. A narrower fixed-robot variant passed complete inertia-tensor and contact comparisons, but no collider change was retained. Exploratory sources are under `scratch/exact-box-prototype/`. Logs include `scratch/check-exact-box-all.log`, `scratch/check-box-geometry-final.log` and `scratch/check-fixed-box-geometry.log`.

An earlier browser capture failed during initial navigation at the unchanged 30-second harness deadline and exercised no feature actions. Its log is `scratch/arm-capture-reopen.log`. The later current-main capture above completed those actions. A separate earlier broad run reported a V8 worker SIGTRAP in Routine handoff coverage. Neither observation changed deadlines or quarantine policy.

## Arm workspace inspection

The workspace acceptance matrix uses real WASM MuJoCo and ordinary forward kinematics on ten generated arms. Negative inputs include missing collision provenance, unresolved compiled joint identities, a disconnected target part, floating bases, moving-world metadata, forbidden self-contact, intervening geometry and exhausted budgets. `ArmConfiguration` now refuses a declared joint name absent from the compiled model instead of silently omitting that coordinate. Existing valid planner inputs keep their original eligibility and search limits.

`armWorkspaceSession.test.ts` makes a worker boundary return after cancellation and replacement. It checks the abort signal and rejects both obsolete and disposed replies. The workspace hook cancels preparation and sampling on immutable source changes, compares request generations after both asynchronous stages, hides results during the render that replaces their source and restores the current pose during cleanup. Tool-point and sample-budget edits start new generations. The sampler releases its engine and message channel in `finally`, and the existing Skills client terminates the worker on completion or abort.

`armWorkspaceTarget.test.ts` exercises the production Skills job dispatcher, a found motion and the existing bounded timing refusal. It also prepares a move environment for the second arm without reordering the model or changing parked values, and refuses missing geometry provenance before move judging or retention. Fixed-arm move playback uses the existing collision-aware development trials before the unchanged Arena. The selected sample supplies a supporting configuration, not a reachability or retained-skill verdict.

The final local named-file check passed 684 tests across 115 selected files, including the original arm-planning, feasibility and native replay suites. Formatting, lint, types, documentation and all 348 site pages passed in that same check. No full suite or regular e2e command ran locally. Linux and Windows browser and portable checks remain CI work, rather than local measurements.

## Hosted arm-planning callback deadlines

[Check 44474977845](https://github.com/JamelHammoud/basecase/actions/runs/44474977845) at `1e4b6bf9963a72b2c2f1625465453f1c4659cac9` reported the prompt solver callback in `armPlanningMatrix.test.ts` at 8,695 ms against its unchanged 5,000 ms deadline on Linux. The ten generated reaches, both rotations and six independent negative controls passed there. Exact-revision [Linux diagnostic 44476094277](https://github.com/JamelHammoud/basecase/actions/runs/44476094277) reproduced the prompt timeout at 7,760.851263 ms with one worker, zero retries and quarantine off. Both used image `20261111.196.1`. Ticket `d2081561-690a-47f2-8c37-b9acf53758ac` retains the verified manifest, test output and cleanup evidence. The diagnostic process took 9,531 ms and its job took about 1.067 elapsed minutes including preparation. This is one reproduction, not a flake-rate measurement.

The Windows second unit shard completed after the initial failure brief and added thirteen callback deadline failures in that file on image `20261103.298.1`:

| Declaration | Reported duration, ms |
| --- | ---: |
| divider | 7,665 |
| column | 6,825 |
| shelf | 7,278 |
| cabinet | 7,979 |
| bins | 6,991 |
| parked-arm | 9,159 |
| base-fold | 7,746 |
| long-tool | 7,714 |
| asymmetric | 7,167 |
| narrow-passage | 8,633 |
| rotated 37 degrees | 9,818 |
| rotated -71 degrees | 9,575 |
| prompt solver | 17,674 |

The generated callbacks reached their post-validation measurement output and completed the geometry, saved-bundle and retention assertions without a reported assertion failure. Their `raceDraft` validation alone took 6,230.7241 to 8,852.8971 ms, beyond the callback budget. Drafting took 188.9609 to 976.6946 ms and independent inspection took 14.1206 to 46.0329 ms. The stage between draft and inspection is established as expensive, but the existing markers do not separate physical development trials from Arena. Prompt and rotated cases lack internal markers. Their callbacks establish entry and deadline expiry, not a stalled internal stage.

Classification is a hosted deadline regression introduced by `5184bd019`, which added these declarations after last full green [Check 44391437908](https://github.com/JamelHammoud/basecase/actions/runs/44391437908) at `d3ee63311358cc0494517acd42328e0bc22e06c8`. The Linux prompt reproduced with one worker, so intermittency is not established. No environment change is established to pin. A reverse-application check of the introducing merge fails in `configurationSearch.ts`, `armConfiguration.ts`, the Skills guide and its testing and performance notes after the workspace feature's edits. A clean revert is unavailable. Product planner, physics and acceptance changes are not justified by a callback timeout alone.

Priority repair [#1848](https://github.com/JamelHammoud/basecase/issues/1848) owns the ten generated reaches, both rotations and prompt solver on Windows, and only the prompt solver on Linux, quarantined through 28 November 2026. Windows retains all six independent negative controls. Linux retains eighteen of nineteen declarations. macOS retains all nineteen. Existing configuration search, collision ancestry, cancellation, native arm replay, runtime retention and browser tests remain active on their existing platforms. These checks do not replace the missing integrated positive observations.

The owner must distinguish endpoint compensation, bounded search, eight guarded physical trials, Arena, prompt confidence evaluation, persistence and cleanup. Restoration requires a demonstrated fix and at least ten baseline and ten candidate observations at equal load on each affected platform and path, with retries disabled. Preserve all ten layouts, both rotations, prompt dispatch, seven-second generated and ten-second prompt/rotated trajectories, eight physical draws, all 96 Arena tries, 5 mm tolerance, dwell, bundle assertions and collision inspections. This repair changes no assertion, deadline, retry, worker policy or product solver. Full job logs, the failed reverse-application check and diagnostic evidence references are retained in the task handoff.
