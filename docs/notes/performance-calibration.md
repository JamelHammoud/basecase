# Calibration and body properties performance

Implementation: [Calibration and body properties](../guide/robot-runtime.md#performance-calibration-and-body-properties). Shared requirements: [Performance](../guide/performance.md).

## Body layouts index membership once

`rigBodies.test.ts` compares complete layouts across fixture robots and 120 generated forests, plus topology edits and repeated visits. Its 300- and 600-joint fixtures reduce parent lookups from 90,300 and 360,600 to 300 and 600. Ownership-entry visits fall from 90,000 and 360,000 to 300 and 600. `mjcfMembers.test.ts` compares complete models with scan-based membership across fixture robots, visibility, role, fixed-joint, order and embedded-placement edits. These are operation counts and output comparisons without timing assertions or a claim about complete Checks or simulation startup time.

## Body mass calculations resolve each robot's fit once

`bodyMasses.test.ts` compares complete properties with per-body resolution across 30 mixed-robot fixtures, invalid fits, renamed links, edits and rollback, and checks payload centroid merging. Its 300- and 600-body fixtures across two measured robots bound body membership reads to 1,800 and 3,600, down from 180,600 and 721,200. These are operation budgets without timing assertions or a claim about complete Checks or export time. Payload geometry still scans scene parts.

## Unweighted normal equations calculate one matrix half

The calibration test checks complete bounded steps, unchanged inputs and repeat calls for 7 parameters with 300 residuals and 14 parameters with 600 residuals. Matrix dot products fall from 49 to 28 and 196 to 105 respectively. Homography, scan and circle accumulation use 36, 21 and 6 products per equation row instead of 64, 36 and 9. Scan tests check symmetry at every solve across flat and 3D iterations. Homography tests cover perspective, inverse projections, noise, edits and singular inputs. These are operation counts, without timing assertions or a claim about complete fitting time.

## Body fitting prepares residual windows once

`bodyResiduals.test.ts` checks elapsed-time boundaries, joint order, independent results, changed recordings and 180 replay comparisons. Its 300- and 600-frame fixtures require 301 and 601 timestamp reads, plus two measured-position reads per frame after the initial frame. Twenty later probes of each half read neither timestamps nor recorded positions. Existing body identification tests check payload, mass and floor-friction recovery through the real MuJoCo pipeline. These are operation counts, without timing assertions or a claim about total fit time.

## Dense solvers scan matrix tails directly

`leastSquares.test.ts` and `denseSolves.test.ts` check pivoting, source preservation, singular refusal, arm targets and force balance with no tail copies. A scratch comparison matched the former results exactly on 300 systems per solver, including empty, singular and row-swapped systems. At 16 variables, calibration and IK each remove 32 temporary arrays containing 256 entries per solve. The three-variable stance solve removes three arrays containing six entries. These are allocation counts, without timing assertions.

## Live angle history reuses circular storage

`robot/robotGap.test.ts` compares 24 generated streams with copied histories and checks inclusive time boundaries, duplicate timestamps, returned angle identities, changing frame rates, long gaps, wrapped growth and resets. Over 3,000 frames at 20 ms intervals and 6,000 at 10 ms, retained-array slice calls fall from 5,498 and 10,998 to zero. Those slices previously copied 1,379,998 and 5,509,998 entries. Every measured-robot gap comparison shares `AngleTrace`. Capacity growth still copies retained entries and keeps its peak capacity until reset. Expiry releases angle references immediately. These are operation counts without timing assertions or a claim about complete simulation time.

## Population distances accumulate during the solve

An app-wide search found one Mahalanobis implementation, in `utils/gaussian.ts`, consumed by `reality/population.ts` through `bandDistance` and `inBand`. Forward substitution now accumulates squared components in row order. The solved vector remains necessary for later rows. The separate reduction and its callback are removed. For the seven servo parameters, this removes seven solved-vector reads per query. These are source-derived operation counts, not latency measurements.

`utils/mahalanobis.test.ts` compares exact results with the previous two-pass equations for 160 generated matrices of zero through fifteen dimensions, then repeats after offset and diagonal edits. Frozen inputs check source preservation. A further 56 cases cover singular diagonals, signed zero, overflow, infinities and NaN. Existing population tests retain held-out membership coverage. No timeout, retry or quarantine changes apply.

The app still supplies no real measured servo populations. This refinement changes no action, label or visible state, so help articles and screenshots remain accurate without edits.

Validation passed implementation formatting and lint, docs, site copy for 314 pages and types. The related run selected 367 files: 364 passed, two failed and one was skipped, with 2,329 passing tests and five failures. Three classroom cup-grading seed batches exceeded 5,000 ms, followed by an incomplete count of 15 rather than 20 runs. The rover-obstacle rendered visibility test exceeded 15,000 ms. Their cause was not established. No deadlines or quarantine entries changed, and the broad selection was not repeated. The log is `scratch/check-distance.log`.

The initial run also found a formatting warning in the new parity test. After formatting it, the focused check on that test and the documentation passed all checks and both tests in 112 ms of Vitest time. That log is `scratch/check-distance-final.log`. Copy accounting is net zero, and preflight has no findings.
