---
title: Simulate self-contact
date: 2026-11-17
collection: simulate-and-train
type: task
covers:
  - src/components/simulate/SelfContactSection.tsx
  - src/sim/selfContact.ts
  - src/sim/contactPreparation.ts
  - src/sim/contactPreparationClient.ts
  - src/sim/useSceneModel.ts
---

Use self-contact to prevent links from passing through one another during simulation. You can keep the same contact model when you train or export the robot.

1. Download the [Folding arm scene](/help/simulate-self-contact/folding-arm.basecase).
2. In [[⌘K]], choose **Open Scene File**.
3. In the file picker, choose `folding-arm.basecase`.
4. In the right panel, open **Simulate**.
5. Under **Self-contact**, switch on the robot.
6. Click **Simulate**.
7. Under **Control**, choose the `Fold` animation.

The distal link stops against the base. Neighboring links stay excluded from self-contact because they meet at a joint.

![The folding arm stopped against its base with self-contact enabled](/help/simulate-self-contact/contact.png)

Stop the simulation, switch off the robot under **Self-contact**, and repeat the `Fold` animation. The distal link passes through the base.

![The folding arm passing through its base with self-contact disabled](/help/simulate-self-contact/disabled.png)

Use **Export Scene** in [[⌘K]] to save a `.basecase` file. Reopen it with **Open Scene File**. You keep the self-contact setting when you reopen the file. You can use Undo to restore a setting you changed.

![The reopened folding-arm scene with self-contact still enabled](/help/simulate-self-contact/reopened.png)

Existing scenes start with self-contact off. If you enable it, you change the physics model. A policy you trained without self-contact becomes out of date.

You can enable self-contact for a robot with up to 128 links and 1,024 collision pieces. Complex meshes use up to 64 convex pieces each. Surfaces thinner than 1 mm get a 1 mm collider, and small holes can close.

If links overlap by more than 0.5 mm at the start, preparation stops and names the links. Preparation stops if collision geometry is missing. Ask the agent for a specific link-pair exclusion if a supported assembly needs one.

For desktop training, you can fall back to native MuJoCo for this model. You can't use its contact exclusions in browser training.

You can't establish physical fit through simulated contact. Keep using the Build tab's clash and joint-sweep checks before making parts.
