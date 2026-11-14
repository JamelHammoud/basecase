---
title: Build a Case app with the agent while it runs
date: 2026-11-13
image: /changelog/build-a-case-app-with-the-agent/cover.png
---

You can now ask the agent for controls for your robot and watch it build them into a running Case.

Ask for a change and only that panel reloads, while the robot and the try keep going.

When the Case's tab is showing, the agent stays beside it. Press ⌘I to bring it back.

## The Agent Sees Its Panels Run

Until now, the agent wrote a Case's code panels blind. A remote whose Dance button threw an error looked finished until someone pressed it.

Now each panel the agent writes runs right away, and about 2 seconds after it loads, the agent reads what happened. It gets the first 10 errors with their line numbers and the first 20 console lines. It also gets the calls the studio refused, with the reason for each, and a picture of the whole window.

The agent is asked to fix what went wrong before it answers you.

Every write is one undo step, so ⌘Z takes the agent's changes back one at a time.

## What Panels Can't Do

In this version, a panel can't move one joint on its own, drive a second robot or save a file. The picture of the window comes from the desktop app.

Read [Build a Case app with the agent](/help/build-a-case-app-with-the-agent) in the help center for the steps.
