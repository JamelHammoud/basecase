# Simulation performance

Implementation: [Simulation](../guide/simulate.md#performance-simulation). Shared requirements: [Performance](../guide/performance.md).

## Simulated sensors reuse world-ray and hit buffers

`rayCasting.test.ts` checks rotated and translated poses against independent Three.js geometry, zero directions, range misses, independent sensors, scan rates, time reversal and snapshots. Its 300- and 600-ray fixtures require 180 rotation-coefficient reads across 20 casts, down from 54,180 and 108,180. A scratch comparison matched 480 complete scan snapshots byte for byte against the previous implementation across 40 sensor configurations, moving poses, different scan rates, range misses and time reversal. These are operation counts and numerical comparisons without timing assertions or a claim about complete simulation time.

## Single-body pose reads transform only their owner

`mjcfFrames.test.ts` compares the previous full-map calculation across rotations, aliases, duplicate ids, both namespaces, missing ids, nonfinite poses, source edits and independent results. Across 20 queries, its 300- and 600-body fixtures reduce body rotations from 6,000 and 12,000 to 20, and matrix clones from 9,000 and 18,000 to zero. Membership searches remain linear in body and member counts. These are operation counts, without timing assertions or a claim about complete simulation time.

## Policy playback retains actuator addresses

`policyCommand.test.ts` compares controls and poses against equivalent held targets for both controller kinds, checks replacement and missing joints, and bounds joint-id reads across 50 substeps. The 12-joint quadruped fixture falls from 4,500 reads to 600, and the 18-joint hexapod from 9,450 to 900. The remaining reads belong to the ordinary hold pass. These are operation counts, without timing assertions or a claim about total simulation speed.

## Physics latency reuses control snapshots

`controlDelay.test.ts` checks every channel through startup, repeated wraps, zero delay, resets and changed control widths. A scratch comparison matched the former controls across 140 runs and 84,000 steps. At eight controls and 20 steps of latency, 1,200 steps allocated 21 snapshots instead of 1,200. `controlDelayWorlds.test.ts` checks 450 real WASM steps in each of the live and Arena paths, including timestep rounding and repeated resets. These are allocation counts, without timing assertions.

## Fixed simulation schedules advance by cursor

A local Node 26.13.0 measurement on shared macOS hardware consumed 40,000 events across 4,001 ticks, including the initial copy and sort. After three warmups, the median of nine runs was 2,135.40 ms with `shift()` and 1.96 ms with the cursor. This measures scheduling alone, not physics, and adds no CI timing assertion.
