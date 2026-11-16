# Onshape imports performance

Implementation: [Onshape imports](../guide/joints-and-motion.md#performance-onshape-imports). Shared requirements: [Performance](../guide/performance.md).

## Onshape updates index remaining joint identities

`onshapeJointIds.test.ts` compares the previous matcher across 160 generated fixtures and later edits, plus frozen inputs, ambiguous mates and root-versus-subassembly collisions. On 300- and 600-joint fixtures with child matches, mate reads fall from 45,150 and 180,300 to 900 and 1,800. With unique-id fallbacks, they fall from 135,150 and 540,300 to 600 and 1,200. Candidates sharing one mate id still require child comparisons. These are operation counts without timing assertions or a claim about complete update time.

## Onshape fixed-mate attachment indexes links once

`fixedMates.test.ts` checks these contracts, source preservation, existing notes and changed source data. Its 300- and 600-part fixtures bound mate-link reads to 600 and 1,200, down from 90,000 and 360,000 in the previous nested scans. These are operation counts, without timing assertions or a claim about complete import time.
