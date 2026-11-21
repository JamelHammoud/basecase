---
title: Simulate contact between your robot’s links
date: 2026-11-17
image: /changelog/simulate-self-contact/cover.png
---

You can make an arm stop against its own base in simulation. Enable **Self-contact** for the robot in **Simulate** to let non-adjacent links collide.

A folding arm can clear the floor and still drive its wrist into its base. With self-contact, you can test that collision in simulation and include it in the physics you train on.

Basecase excludes links that share a joint. Other link pairs can collide unless you declare an exclusion through the agent. Basecase keeps the setting through Undo and when you save and reopen a scene file. You get the same contact configuration in simulation, native training, exported MuJoCo models and recordings.

Existing scenes start with self-contact off. If you enable it, Basecase marks incompatible policies as out of date.

You can enable self-contact on robots with up to 128 links and 1,024 collision pieces. For complex meshes, Basecase uses bounded convex approximations, which can close small holes. If links start with penetration deeper than 0.5 mm, Basecase stops preparation and names the links you need to separate.

Simulated contact doesn't establish physical fit. See [Simulate self-contact](/help/simulate-self-contact) for steps and an example scene.
