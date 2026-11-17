# Onshape imports performance

Implementation: [Onshape imports](../guide/joints-and-motion.md#performance-onshape-imports). Shared requirements: [Performance](../guide/performance.md).

## Onshape mate trees index adjacent groups once

Repository searches found one Onshape mate-to-tree builder, shared by import and Update from Onshape. Each valid mate between distinct rigid groups now contributes two adjacency entries. The traversal examines only entries attached to reached groups. Its adjacency preparation and traversal use linear work and storage in groups and mates, excluding existing rigid-group preparation and joint-frame construction.

`assemblyTree.test.mjs` checks breadth-first ordering, reversed endpoints, fused links, missing occurrences, parallel edges, cycles, unsupported and cylindrical mate notes, disconnected links, later root changes and source preservation. Its 300- and 600-link chain and wide-tree fixtures bound Map reads to fewer than 30 per link. Existing `onshape.test.mjs`, `update.test.mjs` and `assemblyGroups.test.mjs` retain import, update, frame, range and rigid-group coverage.

A scratch Node comparison counted Map reads across the complete `assemblyModel` call, including output preparation. Both chain and wide-tree fixtures fell from 183,595 to 5,691 reads at 300 links and from 727,195 to 11,391 at 600 links. Complete models matched before and after on those four fixtures and 200 generated graph queries with mixed mate types, missing endpoints, cycles, fused groups and two roots per graph. The temporary script and results live in `scratch/onshapeTreeEvidence.mjs` and `scratch/onshape-tree-evidence.jsonl` during implementation. These are operation counts, without timing assertions or a claim about network, conversion or complete import latency. No user action or visible output changes, so help screenshots and browser walkthroughs remain unchanged.

## Onshape updates index remaining joint identities

`onshapeJointIds.test.ts` compares the previous matcher across 160 generated fixtures and later edits, plus frozen inputs, ambiguous mates and root-versus-subassembly collisions. On 300- and 600-joint fixtures with child matches, mate reads fall from 45,150 and 180,300 to 900 and 1,800. With unique-id fallbacks, they fall from 135,150 and 540,300 to 600 and 1,200. Candidates sharing one mate id still require child comparisons. These are operation counts without timing assertions or a claim about complete update time.

## Onshape fixed-mate attachment indexes links once

`fixedMates.test.ts` checks these contracts, source preservation, existing notes and changed source data. Its 300- and 600-part fixtures bound mate-link reads to 600 and 1,200, down from 90,000 and 360,000 in the previous nested scans. These are operation counts, without timing assertions or a claim about complete import time.
