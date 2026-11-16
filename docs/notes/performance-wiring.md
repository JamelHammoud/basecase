# Cable routing performance

Implementation: [Cable routing](../guide/build.md#performance-cable-routing). Shared requirements: [Performance](../guide/performance.md).

## Saved routing choices are indexed once

`routeSpecs.test.ts` compares complete routed netlists against per-net selection using the previous four-field matching rule. Its 24 nets span bus and power routes, with ordered anchors, passing stock and unavailable stock. Reversed choices precede matching choices, and later duplicate choices carry different stock and anchors. The test checks source preservation and a new analysis after inserting an overriding choice. Additional cases check separator collisions, missing endpoints and absent choices. Existing routing tests retain motion, clearance and refusal coverage.

A local scratch comparison used 300 and 600 saved choices, queried once each by a matching net and once each by an unmatched net. Counting reads of each saved choice's source endpoint through an accessor measured 135,450 reads before and 600 after for 600 nets, and 540,900 before and 1,200 after for 1,200 nets. Every lookup returned the same record as the previous linear search. These are operation counts, without timing assertions or a claim about complete wiring latency. The index adds storage proportional to the number of saved choices and serializes one four-field key per choice and queried net. Projects without saved choices skip both storage and key serialization.

## Cable measurements use scalar distances

`routeMeasure.test.ts` compares complete routed netlists on 24 scenes against the previous vector-based distance and path-length implementations. The fixtures vary placement, stationary and moving joints, direct and bracket-detoured paths, and passing and too-short stock choices. Inputs remain unchanged. Numeric comparisons include empty and singleton paths, signed zero, small coordinates, stock-length boundaries, overflow, infinity and NaN. `routeAnalysis.test.ts` retains power-lead, anchor, coupled-motion and refusal coverage.

The existing 300- and 600-point motion-bound fixtures now assert 1,202 and 2,402 scalar distance calls and zero vector distance calls. The preceding implementation used two new vectors per distance call, so those queries avoid 2,404 and 4,804 vector constructions. Each sampled path also avoids two vectors per segment and one copied segment list. These are source-level allocation counts checked through distance-call spies, without timing assertions or a claim about complete routing latency. Visibility-search distances keep their existing `Math.hypot` arithmetic, since replacing either metric with the other can change floating-point results.

## Servo buses group connectors once

`netlistGrouping.test.ts` checks mixed connector ordering, ordered adapter splits, duplicate actuator references, loose servos, surplus and missing adapters, empty scenes and unchanged inputs. Existing netlist tests cover cable quantities, power feeds, engineering findings and BOM output.

A scratch comparison matched complete netlists against the previous implementation on 250 generated scenes. Fixtures varied zero to 24 Feetech servos, half as many DYNAMIXEL servos, zero to four alternating adapters, omitted joint references and reversed joint order. On a separate 600-servo, eight-adapter fixture with both connector types, exported `busIn` calls fell from 3,008 to 1,808 and exported `portOf` calls from 628 to 620. These spy counts exclude calls internal to the connectors module. Connector classification now takes one pass over each list rather than one servo pass plus another per connector and one adapter pass per connector. Counts are local operation measurements, without timing assertions or a claim about total routing latency. The comparison does not exercise arbitrary sourced connector types.

## Cable-clearance queries reuse their interval

`routeCollision.test.ts` checks all axes, parallel epsilon thresholds, grazing contact, disjoint axis intervals, growing and shrinking envelopes, nested queries and unchanged inputs. Existing routing tests cover rotated housings, thin obstructions, coupled joints and deterministic detours. A seeded scratch comparison matched the previous result on 50,049 queries, including rotated boxes and displacement envelopes. Those queries created 193,734 interval arrays before and 50,049 after. These are source-level allocation counts, without a claim about garbage collection or end-to-end routing time.

## Cable motion bounds retain chain geometry across probes

`routeBound.test.ts` compares 12,000 complete bounds across mixed chains, shared ancestors, reversed queries and unowned solids, plus edits, missing ranges, nonfinite inputs and source preservation. It also compares complete netlists against the previous bound on twelve scenes and a later placement edit. Its 300- and 600-point fixtures reduce sine calls from 1,500 and 3,000 to eight, and distance calculations from 3,300 and 6,600 to 1,202 and 2,402. These are operation counts without timing assertions or a claim about complete wiring time.

## Cable detours share local point coordinates

`routeClearance.test.ts` checks oriented obstacles, duplicate obstacle ids, growing and shrinking envelopes, epsilon boundaries, lazy preparation, anchored detours, edits and source preservation. A scratch comparison matched 300 seeded routes against the previous implementation. On an anchored route around four boxes, coordinate transforms fell from 1,450 to 236. This is an operation count, without a timing assertion or a claim about total wiring latency.
