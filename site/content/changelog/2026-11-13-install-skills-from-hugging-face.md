---
title: Install skills from Hugging Face
date: 2026-11-13
image: /changelog/install-skills-from-hugging-face/ranked.png
---

You can now find published skills ranked for your robot in Install Skill, then train one on your robot and check it in Arena. This works in the desktop app.

A hexapod's Stand used to start from zero even when a quad with the same legs could already stand. Now it can start from the quad's policy, with each leg taking the nearest leg that has as many joints.

Skills whose joints fit come first in the list, followed by the closest limb positions and the most Arena passes on the source robot. Skills that don't fit appear last with their reason. You can still install from a repo link.

The Motor Kit trains from the installed policy, and Arena runs 96 tries for Stand on your robot. The new skill keeps its own evidence and the hash of the skill it started from. A ready skill can also be published to Hugging Face for another robot to use.

Install Skill takes Motor Kit skills on legged robots. Taught skills and moves don't install.

Read [Install a skill from Hugging Face](/help/install-a-skill-from-hugging-face) and [Publish a skill to Hugging Face](/help/publish-a-skill-to-hugging-face) in the help center for the steps.
