---
title: Check a robot's Cases from the terminal
date: 2026-11-13
---

`basecase check robot.basecase` runs every Case in a saved scene in Node and exits 1 when one misses, so CI can fail the build when a change to your robot stops it passing.

## How it works

Save the scene with Export ▸ Basecase Scene and point the command at the file. It reads the scene with the same parser Open uses, builds each part's mesh the way the canvas does, and runs each Case through the same runner as the app, with MuJoCo and the Rust contract judge. No window opens, Electron never starts, and nothing goes over the network.

```
Reach a Spot              1 of 1    0.75
Push a Box in a Corridor  0 of 1   -2.10  Missed
```

Each line is the Case's name, how many runs passed, the margin and why it missed. `--json` prints the same as JSON, and `--case <id>` runs one Case. It exits 0 when every Case passes, 1 when any misses, and 2 when the file is missing, isn't a scene, or holds a Case it can't read.

## In GitHub Actions

Check out Basecase beside your repo, install it with `npm ci --ignore-scripts`, and run `node basecase/tools/cli/basecase.mjs check robot.basecase`. [Check your robot in CI](/help/check-your-robot-in-ci) has the whole workflow. In a clone of Basecase, `npx basecase check` works too.

## Exporting without the app

`basecase export robot.basecase --package robot` writes the Robot Package, the MuJoCo model, URDF with meshes and joint map, into a folder, from the same loader.

## What it doesn't do yet

Each Case runs once, in a perfect world: friction, mass and servo strength are exactly as designed. A part the agent sourced that isn't in the catalog yet runs as its box, because its mesh stays on the computer that sourced it.
