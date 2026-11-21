---
title: Repair a robot build
date: 2026-11-20
collection: build-and-print
type: task
order: 12
related:
  - allocate-parts-to-robot-builds
  - resume-a-robot-build
  - link-a-build-repair-to-fleet
covers:
  - src/kit/buildRepair
  - src/workspace/buildRepairPreview.ts
  - src/workspace/frozenBuildSession.ts
  - src/workspace/frozenRepairPlayback.ts
  - src/components/build/BuildRepair
  - src/components/build/FrozenBuildView.tsx
---

You can replace parts on one saved robot against a checked revision and keep the other robots' geometry, progress and materials intact.

You can replace one part or a declared group of up to twenty parts with a proven removal and reassembly plan. Keep the original part identities.

If you add or remove identities, move parts, change joint topology or encounter blocked access, you need a different plan. You can't change the print process, infill or resting faces during repair.

For printed replacements, [record completed target plates](/help/allocate-parts-to-robot-builds#assign-printed-copies) before starting repair. You can export retained 3MF manufacturing files without recording production.

1. In the editable design, make the replacement changes.
2. Under **Build**, resolve the target design's **Checks**.
3. Under **Builds**, click the robot build's name.
4. Under **Repair**, click **Repair Build**.
5. In **Target revision**, choose **Current design** or a retained revision.
6. Click **Compare**.

![The repair comparison shows Arm 1’s source and target hashes and the changed service plate](/help/repair-a-robot-build/compare.png)

You can review component identities, geometry, manufacturing, wiring and joint declarations in the comparison. If you rename a part or change its appearance without other changes, you don't need a physical replacement.

7. Click **Start Repair**.
8. Follow the removal instructions to remove the indicated parts.
9. After you complete the action, click **Complete Step**.
10. Press [[→]] to move to the next action.

![Arm 1’s retained repair displays a removal step with its part callout](/help/repair-a-robot-build/removal.png)

11. Under **Replacement parts**, reserve the required components or assign compatible printed copies.
12. Follow each replacement and reassembly action, recording it with **Complete Step**.
13. Under **Repair**, click **Finish Repair**.

![Arm 1’s completed repair remains in Build history with its target revision](/help/repair-a-robot-build/completed.png)

On a printed replacement step, click **Export 3MF** to download the target Kit's retained manufacturing file. If you need several plate files, you download them together in an archive.

![The retained replacement step offers Export 3MF for the target service plate](/help/repair-a-robot-build/replacement.png)

After you restart, open the same build under **Builds**. Click **Resume Repair** to continue the saved plan, even if you changed the editable design.

Click **Finish Repair** to advance this build's effective revision. You can read its original assembly and earlier repairs in **Build history**.

You keep physical ownership intact when you start, cancel or finish a repair. See [Allocate parts to robot builds](/help/allocate-parts-to-robot-builds) for compatible copies and confirmed returns.

If you click **Cancel Repair**, you leave reported work incomplete until you resume. If you cancel before recording work, you keep the canceled plan and any reserved materials.

You record reported work when you complete a repair. You don't establish dimensional inspection, successful calibration, a retained policy or Ready to build through completion.

Follow [Link a build repair to Fleet](/help/link-a-build-repair-to-fleet) to attach an optional reference to an existing robot. You can repair a build locally without Fleet.
