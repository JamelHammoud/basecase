# Build test evidence

Current coverage: [owning guide](../guide/build.md#testing-coverage). Shared policy and harness contracts: [Running and testing](../guide/running-and-testing.md#0e-tests).

## BOM cable stock

The duplicate cable browser test was removed after taking 45 s and failing in run 43721538732. It searched for the provisional Bus Servo Cable row, which measured stock replaces. The previous green run 43715791435 passed it only on retry on both Linux and Windows.

## Falls

The Falls browser test in `e2e/buildCheck.e2e.test.ts` was narrowed under [#1094](https://github.com/JamelHammoud/basecase/issues/1094). In run 43715791435 it took 50.166 s on Windows and 32.196 s on Linux, while the matching `src/utils/engineeringFalls.test.ts` Node test passed in 690 ms and all nine Falls tests passed in 3.961 s on Linux.

## Build Along

The combined Cable reach walkthrough took 59 s in run 43715791435 ([#1091](https://github.com/JamelHammoud/basecase/issues/1091)). For `e2e/buildCable.e2e.test.ts`, before the viewport and label assertions were added, it took 8.901 s on Linux and 12.602 s on Windows in run 43739315274. The separate guide-generation walkthrough was removed under [#1152](https://github.com/JamelHammoud/basecase/issues/1152) after taking 35.169 s on Linux and 26.724 s on Windows in run 43739315274. The responsible stage was not isolated. The separate arm readiness browser test and its Windows quarantine were removed under [#859](https://github.com/JamelHammoud/basecase/issues/859) after it took 32 s in run 43642970706.

The retained tests do not cover the complete palette-to-generated-guide browser path.

## Parts on hand

The duplicate browser test was removed after taking 64 s in run 43642970706 and failing repeatedly on Windows (#851, #836).

## Passive robot joints

Passive declarations do not create missing-servo or torque-estimate warnings. They remain in the rig and range sweeps. Payload mapping rejects a chain containing passive motion rather than using an old effort rating as a motor. Walk and falls keys hash full declarations, so changes invalidate cached evidence without a new version or cache format.

## Manufacturing kit export

`src/kit/buildKit.test.ts` exercises ten generated scenes through `buildBom`, `buildGuidePlan`, `jobSpec`, `writeThreeMf` and the existing Robot Package files producer. The matrix includes rover, SO-101-style arm, hexapod, quadruped, pan-tilt camera, gripper, mixed servos, multiple print materials, repeated limb modules and partly owned hardware. Packing totals equal demand, purchases preserve the BOM, physical IDs occur once, every print maps to 3MF content and servo entries equal the package producer's joint map. Repeated-module metadata is asserted explicitly.

Fault cases cover stale guide fingerprints, missing measurements and plates, unknown variants, unknown extra identities, missing step coverage, sheet fabrication and duplicate filenames. An unproven step stays unproven and no Checks result becomes a ready claim. Current, stale and absent Checks are distinguished. `readiness/currentWiring.test.ts` fixes the measurement time and verifies that applying decisions retains it alongside measured cable choices. Previously `withDecisions` rebuilt `checkedAt` from the current clock, making an old measurement appear newly checked. `src/workspace/kitExport.test.ts` replaces the expensive rendering and geometry boundaries and verifies fresh nonpersistent guide generation, saved owned counts with a cold inventory cache, catalog load failure, cancellation before and during preparation, edits to parts, settings and name, and cancellation or editing during compression. It retains the real plate specification and label selection logic.

`e2e/kit.e2e.test.ts` opens a small generated arm through the app's scene loader, clicks Export ▸ Kit and inspects the download on desktop and web. It checks packing step references, the exact c001 servo variant, embedded plate geometry, the build guide and joint-map agreement. These browser tests are left to CI. A separate documentation capture drove the same desktop entry with no browser errors. The repeated-module measurement also inspected a real downloaded archive. No printer, servo programming, assembly fit or fulfillment is tested or claimed.

The ten-fixture matrix uses simple generated geometry with the real manufacturing producers. It is not a catalog-mesh accuracy or physical-fit benchmark. Browser captures use the real catalog mesh loader. The preparation measurement and its memory limitations are in [Printing performance evidence](performance-printing.md#manufacturing-kit-composition). No tests were quarantined or given retries or longer timeouts.

The copy-diff scanner reports six added UI string occurrences, no changed or removed occurrences, for a net +6. These are two Kit entry labels and the existing progress, Cancel, completion and error patterns. Refusal messages remain specific to missing manufacturing evidence.
