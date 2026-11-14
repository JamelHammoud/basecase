---
title: Install skills from Hugging Face
date: 2026-11-13
image: /changelog/install-skills-from-hugging-face/cover.png
---

You can now publish a ready skill to Hugging Face and install it on another robot, where Arena proves it again. It works in the desktop app, for Motor Kit skills on legged robots.

Publish to Hugging Face is in a ready skill's right-click menu under Train. Install Skill is in ⌘K and takes the repo's link.

A policy on the Hub is trained for one robot, and nothing says it works on yours. Without it, a hexapod's Stand starts from zero, even when a quad with the same legs already stands.

Install Skill maps the quad's policy onto the hexapod's legs. Each leg takes the nearest leg with as many joints, so its middle pair copies the front pair. The Motor Kit then trains from that policy, and Arena runs its 96 tries on the hexapod. The new skill keeps the hexapod's own evidence and the hash of the skill it started from.

Every downloaded file is checked against `skill.json` before anything trains. A repo whose legs have a different number of joints is refused. Taught skills and moves don't install.

The repo also carries the policy as ONNX and a model card with the observation, the action and the body class.

Steps are in [Install a skill from Hugging Face](/help/install-a-skill-from-hugging-face) and [Publish a skill to Hugging Face](/help/publish-a-skill-to-hugging-face).
