---
title: Check your robot in CI
date: 2026-11-13
collection: simulate-and-train
type: task
covers:
  - tools/cli/basecase.mjs
  - src/cases/sceneCheck.ts
  - src/three/headlessParts.ts
  - src/sim/robotPackage/scenePackage.ts
---

Run your robot's Cases on every push, so a change that stops one passing fails the build.

1. Add the Cases the robot should keep passing in Play ▸ Cases, with New Case or an example.
2. Choose Export ▸ Basecase Scene and commit the `.basecase` file to your robot's repo.
3. Add the workflow below as `.github/workflows/cases.yml`, with your file's name in the last line.
4. Push. The job runs every Case in the scene and fails when one misses.

```yaml
name: Cases
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/checkout@v4
        with:
          repository: JamelHammoud/basecase
          path: basecase
      - uses: actions/setup-node@v4
        with:
          node-version-file: basecase/.nvmrc
      - run: npm ci --prefix basecase --ignore-scripts
      - run: node basecase/tools/cli/basecase.mjs check robot.basecase
```

It runs in Node with MuJoCo, the same runner the app uses, and needs no window, no Electron and no network. Each Case gets one line: its name, how many runs passed, the margin (above zero clears the goal) and why it missed.

```
Reach a Spot              1 of 1    0.75
Push a Box in a Corridor  0 of 1   -2.10  Missed
```

The command exits 0 when every Case passes, 1 when any misses, and 2 when it can't check the scene: the file is missing, isn't a Basecase scene, or holds a Case it can't read.

- `--case reach-a-spot` runs only that Case, by its id.
- `--json` prints `{ "cases": [{ "id", "name", "runs", "passes", "margin", "failed" }] }` instead of lines.
- `basecase export robot.basecase --package robot` writes the same Robot Package Export ▸ Robot Package saves, as a folder.

In a clone of Basecase, `npx basecase check robot.basecase` runs the same command.

Catalog parts and parts the agent modelled use their real meshes. A part the agent sourced that isn't in the catalog yet runs as its box, because its mesh stays on the computer that sourced it.
