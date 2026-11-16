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
