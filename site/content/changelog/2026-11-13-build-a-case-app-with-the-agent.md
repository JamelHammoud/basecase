---
title: Build a Case app with the agent while it runs
date: 2026-11-13
image: /changelog/build-a-case-app-with-the-agent/cover.png
---

You can now ask the agent for controls for your robot and watch it build them into a running Case. Ask for a change, and only that panel reloads while the robot and the try keep going.

The agent stays beside the running Case when its tab is showing, and ⌘I brings it back.

Before, the agent wrote a Case's code panels blind. A remote whose Dance button threw an error looked finished until someone pressed it.

Now each panel the agent writes runs at once, and about 2 seconds after it loads the agent reads what happened. It gets the first 10 errors with their line numbers and the first 20 console lines. It also gets the calls the studio refused, with why, and a picture of the whole window. It's asked to fix what went wrong before it answers you. Every write is one undo step, so ⌘Z takes the agent's changes back one at a time.

A panel can't move one joint on its own, drive a second robot or save a file in this version. The picture of the window comes from the desktop app.

Steps are in [Build a Case app with the agent](/help/build-a-case-app-with-the-agent).
