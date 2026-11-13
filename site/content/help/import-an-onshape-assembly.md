---
title: Import an Onshape assembly as a robot
date: 2026-11-12
updated: 2026-11-13
collection: design
type: task
order: 17
keywords:
  - onshape
  - cad
  - assembly
  - mates
  - api key
  - accounts
related:
  - import-a-robot
  - pose-a-robot
covers:
  - src/components/settings/AccountsPane.tsx
  - src/components/ImportRobotSheet.tsx
  - src/onshape/
  - electron/onshape/
  - src/readiness/buildChecks.ts
  - src/workspace/useOnshapeUpdate.ts
---

Bring a robot you modeled in Onshape into Basecase, with its revolute and slider mates as joints you can pose.

1. In Onshape's developer portal, create an API key that can read your documents, and copy its access key and secret key.
2. Open Settings with ⌘, and choose **Accounts**.
3. Paste the access key into **Access key** and the secret key into **Secret key**. Once both are saved, your Onshape account name shows under Secret key.

![The Accounts pane with both Onshape keys saved](/help/import-an-onshape-assembly/accounts.png)

4. In Onshape, open the assembly's tab and copy the link from the address bar.
5. Press ⌘K, choose **Import Robot**, paste the link and press Enter.

![Import Robot with an Onshape assembly link](/help/import-an-onshape-assembly/link.png)

Each part comes in as its own mesh, except parts held together by a fastened mate or a mate group, which become one part. Revolute mates become hinges and slider mates become slides, with the mate's limits as the joint's range, and 0 is where the assembly sat when you imported it. A revolute or slider mate inside a subassembly becomes a joint too, but without its limits. The fixed part in Onshape is the robot's base. Parts with a material in Onshape bring their mass.

6. Click **Pose** in the message that says the robot was inserted, and drag a joint's slider.

![The Pose tab turning the imported Elbow hinge](/help/import-an-onshape-assembly/pose.png)

Any other mate, like a cylindrical, ball or pin slot mate, is held fixed. The Build tab's Checks list each one under Fixed Mates, on the part it holds, so you can add the joint by hand. A mate that closes a loop, like the last pin of a four-bar linkage, is left out, because each part hangs off exactly one joint.

When the assembly changes in Onshape, bring the changes in without importing it again:

7. Right-click the robot's group in Layers, or any of its parts, and choose **Update from Onshape**. It's in ⌘K too.

![The right-click menu of the Desk Arm group with Update from Onshape](/help/import-an-onshape-assembly/update.png)

Parts you changed in Onshape are replaced where they sit, new parts and mates come in as parts and joints, and parts you deleted there are removed. The servo on each joint, colors, parts you added like screws or cameras, poses and calibrations stay. A message counts the changes, and ⌘Z undoes the whole update.

![The arm after the update, longer and with a new Wrist part, and the message 3 changes from Onshape](/help/import-an-onshape-assembly/updated.png)

If you delete a mate in Onshape, its joint stays, and Checks lists it under Missing Mates so you can remove it or add the mate back. A link to a version always brings that version, so import from the workspace link to keep up with your edits.
