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
