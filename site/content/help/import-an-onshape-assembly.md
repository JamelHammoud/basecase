---
title: Import an Onshape assembly as a robot
date: 2026-11-12
covers:
  - src/components/settings/AccountsPane.tsx
  - src/components/ImportRobotSheet.tsx
  - src/onshape/
  - electron/onshape/
  - src/readiness/buildChecks.ts
---

Bring a robot you modelled in Onshape into Basecase, with its revolute and slider mates as joints you can pose.

1. In Onshape's developer portal, create an API key that can read your documents, and copy its access key and secret key.
2. Open Settings with ⌘, and choose **Accounts**.
3. Paste the access key into **Access key** and the secret key into **Secret key**. Once both are saved, your Onshape account name shows under Secret key.

![The Accounts pane with both Onshape keys saved](/help/import-an-onshape-assembly/accounts.png)

4. In Onshape, open the assembly's tab and copy the link from the address bar.
5. Press ⌘K, choose **Import Robot**, paste the link and press Enter.

![Import Robot with an Onshape assembly link](/help/import-an-onshape-assembly/link.png)

Each part comes in as its own mesh, except parts held together by a fastened mate or a mate group, which become one part. Revolute mates become hinges and slider mates become slides, with the mate's limits as the joint's range, and 0 is where the assembly sat when you imported it. The fixed part in Onshape is the robot's base. Parts with a material in Onshape bring their mass.

6. Click **Pose** in the message that says the robot was inserted, and drag a joint's slider.

![The Pose tab turning the imported Elbow hinge](/help/import-an-onshape-assembly/pose.png)

Any other mate, like a cylindrical, ball or pin slot mate, is held fixed. The Build tab's Checks list each one under Fixed Mates, on the part it holds, so you can add the joint by hand.
