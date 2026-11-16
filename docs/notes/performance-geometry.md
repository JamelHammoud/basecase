# Mesh preparation performance

Implementation: [Mesh preparation](../guide/canvas.md#performance-mesh-preparation). Shared requirements: [Performance](../guide/performance.md).

## Screw recesses copy geometry directly

`hardwareRecessGeometry.test.ts` compares exact buffers across 180 transformed indexed, expanded and interleaved meshes, threshold boundaries, nonfinite coordinates, normalized normals, empty inputs and later edits. It also compares complete CSG pieces for every recessed screw type and supported drive. Its 300- and 600-triangle fixtures reduce cleanup vector clones from 600 and 1,200 to zero, indexed expansions from one to zero, and group coordinate arrays from 1,800 and 3,600 to zero. These are operation counts and output comparisons, without timing assertions or a claim about complete hardware build time.

## Imported mesh assembly transforms and bounds in one pass

`linkSoup.test.ts` compares the previous calculation across 180 seeded piece sets, affine and projective transforms, empty inputs, nonfinite coordinates and later edits. Its 300- and 600-triangle fixtures remove 2,700 and 5,400 intermediate coordinate writes, the combined-buffer copy and a separate bounds scan over 900 and 1,800 vertices. These are operation counts and result comparisons, without timing assertions or a claim about complete import time.

## CAD crease filtering indexes only requested segments

`creaseEdges.test.ts` checks threshold boundaries, welded vertices, source order, duplicates, exceptional topology, packed worker results and fallback mesh lines. Fixtures with 300 and 600 unrelated faces each calculate only two adjacent normals. Indexed grids with 512 and 2,048 triangles read coordinates once per vertex plus 18 reads for the two adjacent normals. Tests also check that changed positions are read afresh on each call. A scratch comparison matched the former output in 120 cases across transformed boxes, spheres and tori with ordinary and packed inputs. A 5,000-triangle plate with three requested segments reduced normal calculations from 5,000 to three. These are operation counts, without CI timing assertions.

## Mesh measurements accumulate bounds and mass properties together

`meshMeasure.test.ts` covers translated and reversed tetrahedra, planar and degenerate triangles, empty and incomplete inputs, source preservation and coordinate-read counts. The 300-triangle and 600-triangle fixtures fall from 5,400 and 10,800 coordinate reads to 2,700 and 5,400. These are operation counts, without wall-clock assertions.

## Booleans cut in the geometry worker

For two 50,000-triangle meshes (`booleans.perf.test.ts`) that is about 2 ms to hand off and 3 ms to take the reply, while the cut (welding, Manifold) takes about 180 ms in the worker; it used to run on the main thread in three-bvh-csg. The test fails if any main-thread step reaches 16 ms.

## STL transforms stream one facet at a time

Scene export and posed print-service meshes previously retained 36 bytes of transformed coordinates per triangle alongside the final STL. Both now retain one 36-byte triangle workspace, independent of mesh size. At 30,000 and 60,000 triangles, transformed-coordinate storage falls from 1,080,000 and 2,160,000 bytes to 36 bytes. The final STL still takes 84 bytes plus 50 bytes per triangle. Scene export still retains its source-array references and one matrix and vector. These are structural storage counts, not measured process-memory peaks.

`src/three/analysis/sceneStl.test.ts` compares complete files against the former transform-and-encode path across 80 generated meshes and subsequent edits. Coverage includes offset typed-array views, repeated instances, rotations, translations, reflections, collapsed scales, projective scene transforms, empty inputs, degenerate facets and nonfinite and incomplete posed inputs. Existing `analysis.test.ts` checks worker export and Z-up placement, and `posedStl.test.ts` checks off-plate placement. The untransformed `binaryStl` API retains double-precision normal calculation for Robot Package callers.

A local replay on shared macOS arm64 hardware with Node 26.13.0 used 21 alternating five-call batches after five warmup batches. At 30,000 triangles, median posed write time changed from 1.98 ms to 1.94 ms and scene write time from 2.81 ms to 1.92 ms. At 60,000 triangles, posed writing changed from 4.00 ms to 3.68 ms and scene writing from 8.36 ms to 7.14 ms. These measure transforms and byte encoding alone, exclude worker handoff and file saving, and have no CI timing assertions. Other work shared the machine, so these timings do not establish a complete-export speedup. No UI state, workflow or browser coverage changes.
