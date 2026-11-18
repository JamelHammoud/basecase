# Strength and Lighten performance

Implementation: [Strength and Lighten](../guide/build.md#performance-strength-and-lighten). Shared requirements: [Performance](../guide/performance.md).

## Elastic block lookups search sorted rows

A whole-app search found one sparse elastic block lookup, in `strength/elasticPattern.ts`. It serves all 64 destination queries per hexahedral element and diagonal lookup during block-Jacobi setup. Strength and Lighten share both consumers. Each row already has sorted unique columns, with at most 27 neighbors, so binary search replaces the repeated scan without new storage or retained state.

A scratch comparison matched complete row starts, columns and destination tables exactly on six dense and perforated grids. Dense grids contained 300, 600 and 10,000 cells. Perforated grids removed every fifth cell and contained 240, 480 and 8,000 cells. On shared macOS arm64 hardware with Node 26.13.0, median dense connectivity preparation times fell from 0.448 ms to 0.397 ms for 600 cells and from 7.854 ms to 6.966 ms for 10,000 cells. Each result used five warmup batches and 21 alternating measured batches of ten calls per implementation. These measure connectivity preparation alone, without CI timing assertions or a claim about complete Strength or Lighten latency. Scratch source, baseline and results remain local in `scratch/elastic-lookup.mjs`, `scratch/elasticPattern-before.ts` and `scratch/elastic-lookup-results.json`.

`elasticNeighbours.test.ts` checks exact lookup and rejection across row lengths zero through 27, missing columns before, between and after entries, nonzero-offset typed-array views, unchanged sources and subsequent edits. Its existing independent set-based reference covers 120 dense, sparse, disconnected and singleton-axis fixtures, repeated elements and corner identities. `elasticPattern.test.ts` retains independent dense assembly and changed-support displacement comparisons. `cg.test.ts` covers all four materials, partial supports and stopping behavior.

The scoped `check:changed` passed formatting, ESLint, documentation, all 323 site pages and TypeScript. Related selection passed 467 tests across 64 files in 50.97 seconds. No timeout, retry or quarantine changed.

The merged-tree review run passed the same static checks and all Strength tests. Related selection passed 463 tests and failed four across 64 files in 81.10 seconds. Each failure exceeded its existing 5,000 ms limit: the unsliced multi-material Bambu archive in `electron/print/project.test.mjs`, cup-carry seeds 1 through 5 in `classroom/grading.test.ts`, the scene chest-chore case in `cases/fixtureWorkflow.test.ts` and catalog geometry loading in `leagues/replay.test.ts`. Other sections below record prior timeout observations in these same tests. This run does not establish that the lookup change caused them, and the complete command cannot be reported as passing. The review log remains local in `scratch/review-1644-check.log`. No timeout, retry or quarantine changed.

## Elastic solves stop before preparing unused directions

A whole-app search found one block-Jacobi conjugate-gradient implementation in `strength/cg.ts`, called by Strength displacement solving and every Lighten optimization load case. The final completed iteration now checks its residual and iteration limit before preconditioning the residual or constructing the next direction. It removes one preconditioner pass and one direction-update pass from every solve that performs at least one iteration. Initial setup remains unchanged, including solves that perform no iterations.

A scratch comparison matched complete displacement arrays, iteration counts and residuals exactly in 374 cases against the previous solver. Cases cover four materials, dense and sparse meshes, opposite support faces, zero and fractional iteration limits, strict threshold equality, changed forces, nonfinite forces and NaN tolerances. The 300- and 600-cell fixtures contain 1,560 and 3,060 displacement unknowns. At limits of 1, 7 and 100 iterations, each solve removes 4,680 and 9,180 inverse coefficient reads, respectively. The removed vector passes visit 3,120 and 6,120 scalar entries in total. These are structural counts from the loops and fixture dimensions, without a runtime profiler, timing assertions or a claim about complete Strength or Lighten latency.

`cg.test.ts` retains independently calculated displacement and residual coverage across all four materials, changed loads, source preservation, partial supports and empty or unloaded systems. Its stopping test also checks exact threshold equality and identical output when convergence and the iteration cap stop at the same iteration. Scratch source and complete comparison results remain local in `scratch/cg-stop.test.ts` and `scratch/cg-stop-results.json`.

## Lighten measures reconstructed pieces once

`lightenPieces.test.ts` compares 120 generated fixtures in both orders, subsequent edits, zero-volume ties and real Manifold decomposition, with one volume call per piece at 300 and 600 pieces. On native Manifold cube fixtures of those sizes, selection and the returned volume required 4,149 and 9,489 volume calls before, and 300 and 600 after. On macOS arm64 with Node 26.13.0, median selection times fell from 0.27376 ms and 0.66528 ms to 0.01907 ms and 0.04087 ms. Each comparison used four warmup batches and 21 alternating measured batches of 100 calls per implementation. These measure selection alone, without CI timing assertions or a claim about complete Lighten time.

## Strength builds only the displayed stress field

`stressIndices.test.ts` compares 400 generated orientation reductions with the previous calculation, plus subsequent edits, ties, nonfinite inputs and independent fields. `stressOrientations.test.ts` checks complete real solves with zero, three and twelve alternatives. At twelve alternatives, field reductions and node-index buffers fall from thirteen to one each. These are operation counts, without timing assertions or a claim about complete Checks time.

## Lighten surface queries use scalar coordinates

`lightenSampling.test.ts` compares exact samples across 80 sparse, translated and anisotropic grids, boundaries, nonfinite coordinates and edited inputs. It also compares complete Manifold reconstruction meshes for three fields. Its 300- and 600-query fixtures reduce mapped coordinate arrays from 3,000 and 6,000 to zero. These are operation counts and output comparisons, without timing assertions or a claim about complete Lighten time.

## Lighten density trials reuse one result buffer

`lightenDensity.test.ts` compares the previous calculation across 120 generated inputs, budget boundaries, typed-array views, edited inputs and 300-, 600- and 40,000-cell fixtures. Mapped typed-array allocations fall from 56 to zero per update, with one explicit result allocation. Separate volume reductions fall from 55 to zero. On shared macOS arm64 hardware with Node 26.13.0, the 40,000-cell update's median fell from 26.93 ms to 2.75 ms across 21 alternating three-call batches after five warmups per implementation. This measures the density update alone, without a CI timing assertion or a claim about complete Lighten time.

## Strength load paths index screw connections once

`strengthPaths.test.ts` checks these cases, horn boundaries, material and component barriers, torque splitting, input preservation and receiver edits. Its 300- and 600-unrelated-screw fixtures across 20 servo searches read each stack once. A scratch comparison matched 1,500 complete plans against the previous implementation across 500 generated assemblies and subsequent edits. The same stack-read probe fell from 18,000 and 36,000 to 300 and 600. These are operation counts and output comparisons, without timing assertions or a claim about complete Checks time.

## Tangential loads reuse their force buffer

`loads.test.ts` compares complete buffers across dense and sparse selections, translated and reflected coordinates, oblique and zero axes, signed zeros, nonfinite values and edited inputs. It also checks the applied axial moment independently. Its 300- and 600-selected-node fixtures reduce array iterator starts from 902 and 1,802 to at most two per call. These are operation counts and numerical comparisons, without timing assertions or a claim about complete solve time.

## Voxel rasterization reads triangles directly

`voxelRaster.test.ts` compares complete grids against independent Three.js ray intersections across transformed, reflected, curved, hollow and disconnected solids. It checks winding, anisotropic cells, the projected-area cutoff, adaptive coarsening, source edits and independent results. Its 300- and 600-triangle fixtures reduce triangle-copy arrays from 300 and 600 to zero. These are allocation counts without timing assertions or a claim about complete solve time.

## Hex elements share weighted strain products

`hexElement.test.ts` checks affine energy, strains, stiffness symmetry, rigid motion, source preservation and independent calls across all four materials, rotated layer normals and anisotropic cells. Material-coordinate reads fall from 864 to 576 per element. Explicitly constructed Float64 buffers fall from 70 to 48, holding 6,264 values instead of 8,802. A scratch comparison matched complete stiffness and strain arrays exactly across 160 material, normal and cell-size combinations. These are operation and allocation counts, without timing assertions or a claim about complete Strength or Lighten time.

## Material rotation shares column products

`material.test.ts` compares all four materials against independent stress and strain tensor rotation across 67 normals, plus isotropic invariance, edited inputs and independent outputs. A scratch comparison matched 3,248 complete matrices exactly against the previous calculation, including zero, nonfinite and extremely scaled normals. Across 300 and 600 transforms, row reductions fell from 77,400 and 154,800 to 23,400 and 46,800. These are operation counts without timing assertions or a claim about complete Strength or Lighten time.

## Material inversion retains its augmented rows

A whole-app search found one layered-material compliance inversion, in `strength/material.ts`. Strength solves, stress sampling and Lighten load preparation all call it through `stiffnessFor`. Other inverses serve different matrix shapes and algorithms.

A scratch comparison matched 3,816 complete stiffness matrices exactly against the previous implementation. It covered all four catalog materials, 100 generated stiffness and Poisson combinations, zero stiffness, nonfinite Poisson values and 36 axis, oblique, zero and nonfinite normals. Instrumented maps over twelve-value augmented rows fell from 36 to zero per inversion. Six pivot normalizations and thirty elimination updates now write their existing rows. Matrix setup, row swaps and result extraction still allocate their original storage.

`material.test.ts` retains independent tensor-rotation coverage across all four materials and 67 normals, isotropic invariance, edited inputs and independent outputs. These are numerical comparisons and allocation counts, without a timing assertion or a claim about complete Strength or Lighten latency. Scratch sources and results remain local in `scratch/material-inversion.test.mjs` and `scratch/material-inversion-results.json`.

## Elastic iterations accumulate products during existing passes

`cg.test.ts` checks known displacements, independently measured residuals, changed loads, source preservation, truncated solves and empty, unloaded and fully fixed systems across all four materials. A scratch comparison matched complete solver results exactly in 290 cases. On shared macOS arm64 hardware with Node 26.13.0, five-solve batches of 100 iterations took medians of 17.61 ms before and 17.10 ms after on 300 cells, and 35.20 ms before and 33.97 ms after on 600 cells. Each used 11 alternating measurements after five warmups per implementation. The change removes two full vector scans per iteration and one initial scan. These measure the solver alone, without CI timing assertions or a claim about complete Strength or Lighten time.

## Strength accumulates stress at shared nodes

`stressSampling.test.ts` compares exact results against corner-buffer averaging across four materials, four layer normals, dense and sparse meshes, changed displacements and shares, and unchanged inputs and earlier results. It also checks constant affine stress, changed strain matrices, empty meshes and nodes without cells. Its 300- and 600-cell fixtures bound explicitly constructed Float64 storage to 3,418 and 5,959 values, including the result and two fixed work arrays. The removed corner buffers alone held 14,400 and 28,800 values. These are allocation counts, without timing assertions or a claim about complete Strength solve time.

## Strength voxel traversals reuse neighbor storage

`voxelTraversal.test.ts` checks boundaries, singleton axes, cavities, disconnected solids, edited grids, equal-cost paths, density-ranked detours and unchanged inputs. Its 300- and 600-cell fixtures require one neighbor buffer per operation and respectively 1,199 and 2,399 total queries across depth, labeling and paths, including the mounting search stopping before expanding its final target. These traversals previously created 1,800 and 3,600 neighbor and filtered arrays, and now create three neighbor buffers. This counts those arrays only, excluding frontiers, stacks and path-queue entries, without a timing assertion or a claim about total solve time.

## Lighten stops searching once mounting paths are final

`lightenPaths.test.ts` compares paths with exhaustive simple-path enumeration across 24 weighted, tied and perforated fixtures. It also checks density edits, duplicate regions, disconnected mounts and unchanged inputs. On 300- and 600-cell bars with mounts in their first three cells, neighbor queries fall from 300 and 600 to two in each case. These are operation counts, without timing assertions or a claim about total Lighten time.

## Elastic solves reuse connectivity

`elasticPattern.test.ts` compares assembly against independent dense matrices, checks known displacements with changed supports and densities, and verifies that repeated solves preserve the pattern and previous matrix values. The existing multi-load optimization test checks one preparation for the complete operation. A scratch comparison matched complete matrices and solver results exactly in 24 cases across dense and sparse meshes, four materials and three density scales, plus complete Lighten results for one load and two mixed-material loads. On shared macOS hardware with Node 26.13.0, a batch of 28 assemblies of a 300-cell mesh took a median of 61.35 ms before and 15.24 ms after, including preparation, over nine alternating measurements after three warmups. The retained destination table used 76,800 bytes. This measures assembly alone, without a CI timing assertion.
  - Neighbor collection scans populated slots directly instead of creating a typed-array view per corner pair. Sorted columns, duplicate removal and block destinations stay unchanged. `elasticNeighbours.test.ts` compares set-based connectivity across 120 dense and sparse grids and checks 27-neighbor rows, unused nodes, repeated corners, duplicate elements, source preservation, edited views and independent results. Its 300- and 600-cell fixtures reduce typed-array views from 19,684 and 39,247 to 484 and 847, one per node for final sorting. A scratch comparison matched 240 complete connectivity results against the previous implementation. On shared macOS arm64 hardware with Node 26.13.0, median preparation times fell from 0.75 ms to 0.24 ms for 300 cells, 1.46 ms to 0.49 ms for 600 cells and 23.97 ms to 8.19 ms for 10,000 cells. Measurements used 21 alternating ten-call batches after five warmup batches per implementation. These measure connectivity preparation alone, without CI timing assertions or a claim about complete Strength or Lighten time.

## Lighten

A 100 × 18 × 9 mm solid PLA bracket at 0.5 target mass, 1.5 mm wall and 500 N·mm takes 6.702 s, including the first Manifold load, on an M5 Pro with macOS 27.0.1 and Node 26.13.0. It solves 4,824 cells in 14 updates and produces 33,872 triangles, reducing estimated solid grams from 20.412 to 10.001.

## Mounting-region scans prepare fixed geometry once

`mountRegions.test.ts` checks region membership, source preservation, changed inputs and preparation counts on 300- and 600-cell fixtures. A seeded scratch comparison matched the previous screw and combined frozen-region results on 100,000 points each. On 300- and 600-point mixed-region scans, screw length calculations fell from 300 and 600 to one. Plane normalizations also fell from 300 and 600 to one. These are operation counts, without wall-clock assertions or a claim about full solve latency.

## Lighten prepares fixed filter neighborhoods once

`strength/lightenNeighborhoods.test.ts` checks exact density-filter entries against all element pairs on sparse anisotropic grids, source preservation and bounded distance calculations. A scratch comparison matched the previous filter in 80 cases and complete mass-search grids in 12 cases. Density-filter distance calculations fell from 37,500 and 75,000 to 125 on 300- and 600-cell fixtures. Wall-neighborhood distance calculations fell from 1,925 to 175 on both 120- and 240-cell fixtures. These are operation counts, without wall-clock assertions or a claim about full Lighten latency.

## Lighten expands each retained coarse cell once

`lightenFineGrid.test.ts` compares complete grids across 40 sparse, anisotropic and singleton-axis fixtures at four prefix counts, checks empty grids, source preservation, edits and independent buffers, and compares six complete mass searches with child-to-parent lookup. On 300- and 600-cell fixtures, membership lookups fall from 2,400 and 4,800 to 300 and 600 per build. These are operation counts, without timing assertions or a claim about complete Lighten latency.

## Elastic setup uses scalar block offsets

A whole-app search found block-Jacobi diagonal inversion and support pinning together only in `strength/cg.ts`. Both Strength and Lighten use that solver. Scalar row and block arguments remove one temporary record per sparse block. Direct indexed inverse reads and writes remove one typed-array view and one nine-number array per node.

A scratch comparison matched complete displacement arrays, iteration counts and residuals exactly in 64 cases across four materials, dense and sparse meshes, opposite support faces and four iteration limits. On 300- and 600-cell meshes, instrumented Float64 subarray calls fell from 484 and 847 to zero. Inverse `set` calls, each previously receiving a temporary nine-number array, also fell from 484 and 847 to zero. Those meshes contain 9,610 and 18,259 sparse blocks, respectively, whose pinning no longer constructs index records. Record counts follow the visited sparse blocks rather than a runtime allocation profiler.

`cg.test.ts` retains known-displacement and independent-residual checks and adds independently pinned axes plus the view and inverse-copy assertions. These are operation counts and numerical comparisons, without timing assertions or a claim about complete Strength or Lighten latency. Scratch source and results remain local in `scratch/cg-setup.test.ts` and `scratch/cg-setup-results.json`.

## Density-filter neighbors use scalar grid coordinates

A whole-app search found one density-filter implementation, called by `lightenOptimize.ts` for every Lighten optimization. It now decodes integer cell coordinates directly rather than constructing world centers and rounding them back to grid indices. Candidate neighbors use scalar coordinates and bounds instead of a three-number array and an `Array.some` callback.

On the existing 300- and 600-cell fixtures with unit spacing and a 1.5 mm radius, each cell visits 19 positive-weight offsets. The removed neighbor-coordinate arrays number 5,700 and 11,400. Four additional coordinate arrays per cell disappear from center construction and remapping, bringing the structural totals to 6,900 and 13,800. These counts follow the loops and fixture dimensions, without an allocation profiler, timing assertion or claim about complete Lighten latency. Offset preparation and final output storage remain.

`lightenNeighborhoods.test.ts` retains independent all-pairs comparisons of complete filter entries, weights and sensitivity results. It also checks singleton axes, a single occupied cell, sparse boundary cells, changed spacing, translation, reversed element order and independence of earlier results. Existing Lighten pipeline tests cover the optimization consumers.


## Strength load paths append converging screws directly

A whole-app search found both growing screw-list copies in `utils/strengthPaths.ts`: touched-part collection and merging branch results into the next frontier. `engineeringStrength.ts` uses this traversal for Build Checks and Lighten load collection. Each destination now receives direct appends into its hop-owned list. Branch expansion no longer creates an intermediate map before merging it.

The committed convergence fixtures use 1, 8, 300 and 600 branches, each joining the same printed destination through its own screw. The previous frontier merge copied 44,850 and 179,700 earlier entries at 300 and 600 branches, respectively. Those copies fall to zero. Each screw is appended once to that destination. These are structural counts from the loops, without an allocation profiler, timing assertion or claim about complete Checks latency.

`strengthPaths.test.ts` checks exact path order, original screw references and independent repeated searches. Existing cases retain cycles, duplicate contacts, three-hop limits, material barriers, receiver edits and complete load-plan coverage. A scratch comparison matched complete path results exactly in 1,500 generated assemblies and receiver edits against the previous implementation. Its source is local in `scratch/strengthPaths-parity.test.ts`.

## Strength component filtering shares one probe mesh

A whole-app search found both duplicate complete-mesh builds in `strength/solve.ts` through its private `cellNear` helper. `solveDisplacement` now constructs one complete probe and passes it to both load and support membership scans. The filtered mesh remains separate. `three/analysis/strengthPart.ts` uses this solver for Strength reporting, including verification after Lighten. Lighten's density optimizer already shares its mesh and needs no change.

A scratch comparison matched complete displacement results exactly against the previous implementation across 48 small dense and disconnected anisotropic grids, four materials, changed fill and shell settings, reversed loads and absent supports. Two additional dense fixtures contained 300 and 600 cells. Instrumented `hexMesh` calls fell from three to two per solve on both fixtures. The removed probe contained 520 and 1,020 nodes, respectively. Its final typed buffers occupied 23,280 and 46,080 bytes. This also removes the probe's temporary cell, node and position lists and node-identity map. These are construction counts and buffer sizes, without a heap profiler, timing assertions or a claim about complete solve latency.

`solvePreparation.test.ts` checks connected-component retention, later support and load edits, empty grids, absent mounting regions, finite nonzero displacement, source preservation and the two-build bound. The existing `solve.test.ts` retains the independent beam-theory stress comparison. Scratch source and full results stay local in `scratch/strengthPreparation.test.ts` and `scratch/strength-preparation-results.json`.

The targeted `check:changed` run passed formatting, lint, docs, site copy and types. Related selection ran 58 files and 440 tests. All Strength tests passed, alongside 439 tests overall. One transitive classroom test failed: `classroom/grading.test.ts`, Carry a cup across a table with a valid submission, prescribed seeds 1 through 5, exceeded its existing 5,000 ms limit at 5,029 ms. The related run took 56.77 seconds. This is a local timeout observation, without a baseline reproduction or evidence that probe reuse caused it. No timeout, retry or quarantine setting changed.

## Strength depth propagation reuses frontiers

A whole-app search found one voxel surface-depth propagation, in `strength/voxels.ts`, shared by all Strength displacement solves through `strength/solve.ts`. Other frontiers track assembly members or screw load paths and have different state and stopping rules. The depth traversal now alternates two arrays instead of allocating a next-layer array on every iteration. It retains only adjacent frontiers, without a queue containing every visited cell. Neighbor queries, cell visits and output storage are unchanged.

A scratch comparison matched complete depth buffers exactly in 192 cases against the previous implementation, preserving input grids. Eight dimension sets cover empty grids, each singleton axis, solid cubes and an anisotropic grid. Each uses 24 occupancy patterns including solid, empty and perforated inputs. Solid 5 × 5 × 5, 10 × 10 × 10, 21 × 19 × 17 and 31 × 31 × 31 grids previously constructed 4, 6, 10 and 17 frontier arrays respectively, and now construct two. Single-layer solids still construct two. Empty solids construct two instead of one, with no populated frontier. These are source-derived allocation counts, not retained heap measurements or timings. There is no claim about complete Strength latency.

`voxelTraversal.test.ts` retains independent depth expectations for cavities, sparse and disconnected solids, boundary axes, changed inputs and empty grids. Its existing neighbor-query counts remain unchanged. Scratch sources and results remain local in `scratch/depth-parity.test.ts`, `scratch/voxels-before.ts` and `scratch/depth-results.json`.

The final targeted check passed formatting, ESLint, documentation, all 316 site pages and TypeScript. Related selection ran 72 files with 541 passing tests and eight failures. Strength tests passed. The unchanged delete-tone scan reported Delete controls in `BoardHoleFields.tsx`, `BoardKeepoutFields.tsx` and `BoardPlacementFields.tsx`. Seven 5,000 ms timeouts came from Bambu project compatibility, both fixture-workflow cases, three classroom cup-carry seed batches and catalog-geometry League replay. An earlier related run passed those seven cases and failed only the same delete-tone assertion. No timeout, retry or quarantine changed. The final log remains local in `scratch/check-changed.log`. These failures prevent reporting the complete targeted command as passing.


## Lighten emits only retained neighborhood offsets

A whole-app search found two Lighten neighborhood builders, in `strength/lightenFilter.ts` and `strength/lightenGrid.ts`. Both previously allocated a tuple for every bounding-box offset before filtering. They now append only accepted tuples. Density weights retain their strict positive boundary, wall offsets retain their inclusive radius boundary, and both retain Z/Y/X traversal order and the same distance arithmetic. Output neighborhoods remain shared throughout each operation.

For unit spacing and a 1.5 mm density radius, candidate tuples fall from 125 to 19. For refined spacing of 0.5 × 0.75 × 1 mm and a 1.25 mm wall radius, they fall from 175 to 25. Each builder also removes its filtered output array and the traversal over rejected tuples. One row callback per builder call keeps the loops within the nesting limit. These are source-derived allocation counts, without heap measurements, timings or a claim about complete Lighten latency.

A scratch replay compares complete density-filter buffers in 36 cases and complete mass-search grids in 18 cases. Fixtures vary anisotropic spacing, sparse occupancy, radius and wall thickness, and check source preservation. Existing `lightenNeighborhoods.test.ts` retains independent all-pairs filter comparisons, radius cases, changed inputs, source preservation, mass-search behavior and bounded distance counts. No new permanent test is needed for this direct-emission substitution. Replay source and results remain local in `scratch/lighten-offset-parity.test.ts` and `scratch/lighten-offset-parity.log`. User actions, labels and visible states stay unchanged, so existing Lighten help and screenshots remain accurate.

The targeted check passed ESLint, documentation, TypeScript and all 343 related tests across 55 files. Its site-copy stage failed on unchanged `site/content/changelog/2026-11-17-export-electronics-with-a-robot-kit.md:15`, whose “does not” contraction is already owned by open repair #1694. The complete command cannot be reported as passing. No timeout, retry or quarantine changed. Final validation remains local in `scratch/check-lighten-offsets-final.log`.


## Cell centers use scalar grid coordinates

A whole-app search found mapped grid-center calculations in `strength/mesh.ts` and `three/viewport/stressOverlay.ts`. The first serves frozen-region queries in Lighten grid preparation, load-path preparation and optimization. The second places every displayed stress cell. Both now calculate the three coordinates directly. Other voxel coordinates in mesh construction already use scalars.

A scratch replay checked 18,212 cell centers across singleton, 3 × 5 × 7 and 10 × 9 × 100 grids, with unit and anisotropic spacing and a translated origin. Every returned center matched the previous mapped calculation exactly. Complete Float32 instance matrices and color buffers also matched, retaining source cell order. The replay used the real stress-field store and overlay sync and disposed each overlay afterward.

The overlay removes three coordinate arrays and one mapping callback per cell. Lighten center queries remove two arrays and one mapping callback per query, retaining the returned center tuple. Across the replay this removes 54,636 overlay arrays and 36,424 center-helper arrays. These are source-derived construction counts, without heap profiling, timings or a claim about complete solve latency. No user action, label or visible state changes, so existing help and screenshots remain accurate.

Existing Lighten frozen-region and optimization tests retain pipeline coverage. The direct coordinate substitution uses a scratch replay instead of a new permanent test that repeats the calculation. Replay source and output remain local in `scratch/stress-centers.test.ts` and `scratch/stress-centers.log`.

The targeted check passed formatting, ESLint, documentation, site copy for 330 pages, TypeScript and 525 related tests across 70 files. Copy diff reported no added, changed or removed strings. Preflight flagged the unchanged Strength help article. Reading its steps, thresholds, labels and screenshot descriptions against this substitution confirmed they remain accurate, so the article stays unchanged.

## Duplicate L-bracket browser walkthrough

Issue [#1823](https://github.com/JamelHammoud/basecase/issues/1823) identified the Strength walkthrough in `e2e/buildCheck.e2e.test.ts` as slow. [Check 44391437908](https://github.com/JamelHammoud/basecase/actions/runs/44391437908) records 31,529 ms on Windows shard 4 and 9,050 ms on Linux shard 4. Both passed. The declaration loaded the seeded bracket, waited for its failing Strength row, clicked Fix and waited for the passing row. There are no stage timings establishing which operation dominated.

The declaration and its unused fixture import are deleted. Existing `src/utils/engineeringStrength.test.ts` runs the real strength-report pipeline on the same fixture. It checks the failing factor, blocker classification and print-face fix, then solves the bracket on its side and on the face the fix suggests and requires passing factors and rows. It also covers a thicker bracket. These broader numerical assertions remain unchanged. In the same Check, all three passed on Linux in 1,635, 2,280 and 1,228 ms, respectively, and on Windows in 2,358, 3,270 and 1,791 ms. These are historical observations for the retained tests, not a candidate-revision check.

The removed browser case additionally observed the direct Fix button applying the face and Checks refreshing its verdict. That browser observation is no longer covered. The generic Checks walkthrough still covers expanding findings and sending an agent Fix, which is a different action and does not replace direct print-face coverage. Removal avoids two browser readiness verdict waits without changing production behavior, timeouts, retries or quarantines. No replacement browser duration or whole-shard speedup is claimed.
