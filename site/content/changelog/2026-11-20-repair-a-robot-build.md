---
title: Repair one robot build
date: 2026-11-20
image: /changelog/repair-a-robot-build/cover.png
---

You can repair a saved robot build against a selected checked revision. Other builds keep their geometry, assembly progress and materials.

Select the robot in Build's Builds section, then open Repair Build. Compare the current design or another retained revision before starting the repair.

You can grow a service plate from 30 to 31 mm for one arm while keeping the original plate on a second arm. In the comparison, you can see changes to geometry, component identities, manufacturing, wiring and joints.

You keep both Kit hashes and every recorded action during the repair. Reload to resume the same plan. Finish the repair to advance only the selected build's effective revision.

You can replace one part or a declared group of up to twenty parts with proven access. Basecase refuses unmatched identities and unsupported topology before changing the build.

You must record an explicit physical return to release the original parts from hold. Replacement components and printed copies must match the target Kit.

At completion, you get a report of the work. Completion does not establish inspection, calibration, a retained policy or Ready to build. You can add an optional authenticated Fleet link to reference an existing robot without sending commands.

Steps are in [Repair a robot build](/help/repair-a-robot-build).
