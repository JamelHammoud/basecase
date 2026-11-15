# Harness experiments

Every change to the CAD agent's harness that the nightly lane measured on the micro-evals, kept or not, one entry each. Entries are only ever appended, never rewritten, so a change isn't tried twice as it was. How a change is measured: [Benchmark](../docs/guide/bench.md).

## E-001: Recheck screw seats after mounting changes

- Date: 2026-11-15
- Evidence: runs/harness-202611132102-main-tune/micro/C1/seed-2, nightly-20261115-seat-heads-tune
- Tags: candidate:b53a6890084d2f4e45f5deb30f8008738c4421e4d712d7cfac348b24d8e13814, fingerprint:3a8b783c806077a146841d0a50fd180baca4e3422590980fa1f5b894fbe8e71f, budget

The candidate asked the agent to recheck screw seats, thread engagement and driver access after moving a board or changing mounting thickness. It came from six unseated screw heads in C1's harvested failure.

| Harness | Hash | Identified model responses | Performance verdict |
| --- | --- | --- | --- |
| Before, main a69730df6 | c9e053542ca27bac | 0 | Unavailable |
| After, candidate prompt | 76fbb6d854ed514b | 0 | Unavailable |

Both harnesses requested claude-opus-5-5 at high effort. The comparison selected 37 tune tasks and planned 74 attempts, with eight concurrent slots, one seed and a 120-second task cap. Startup took 207 seconds. The eight-minute deadline stopped scheduling at 480.361 seconds, with 62 attempts recorded and eight timeouts. The process had exited within ten minutes of launch.

The provider refused the prompts because its weekly limit had been reached. No attempt identified an answering model. Fixture grades from these replies do not measure model performance. No held-out confirmation ran, no candidate pull request opened, and the candidate prompt was discarded.

This inaugural comparison was invoked directly on the Mac while building the runner. Release scheduling and the quiet-machine condition were checked with fixtures. The run exposed a missing model identity being graded as a normal answer. The final runner stops on that refusal and records an error, with a regression test covering it.

Report: state/harness/runs/nightly-20261115-seat-heads-tune/report.md. Raw local captures are temporary, and this entry preserves the measurements.
