---
title: Retrain an edited robot
date: 2026-11-16
collection: simulate-and-train
type: task
related:
  - train-stand-and-walk-with-the-motor-kit
  - arena
covers:
  - src/skills/localKitSource.ts
  - src/skills/localKitScope.ts
  - src/skills/runtimeKit.ts
  - src/skills/skillsRuntime.ts
  - src/workspace/useSkills.ts
---

In the desktop app with Forge, use a saved Stand policy to retrain an edited robot, then get fresh Arena evidence.

For Stand, you can reuse a policy if your four-leg or six-leg robot keeps its leg count and has three powered joints per leg. You can use a six-leg source to train a five-leg target. For other mappings and Motor Kit entries, you train from scratch.

In this example, you remove one leg from a hexapod with a saved Stand skill.

1. Open the scene containing your robot and its saved **Stand** skill.

![The hexapod with its saved Stand skill ready](/help/retrain-an-edited-robot/source.png)

2. In the canvas, select the parts of one leg.
3. Press [[⌫]].
4. Open the **Simulate** tab.

![The edited robot with the Stand row offering Train](/help/retrain-an-edited-robot/edited.png)

5. Under **Train**, click **Train** beside **Stand** if the row offers it.

![Stand retraining on the edited robot](/help/retrain-an-edited-robot/training.png)

6. In the **Stand** row, click **Try** when it appears.

![Stand retained with fresh evidence for the edited robot](/help/retrain-an-edited-robot/retained.png)

Basecase may have started background training on desktop after the edit. If you see progress in the row, wait for training to finish.

For most mass, size, stance and joint-limit edits, you’ll see **Recheck** first. **Recheck** runs Arena on the saved policy. If the policy fails, Basecase retrains it and can start from a compatible saved source.

For older skills without a saved source layout, you can still use playback and recheck, but you retrain from scratch. You train from scratch if source files are missing or incompatible.

For other entries, see [Train Stand and Walk with the Motor Kit](/help/train-stand-and-walk-with-the-motor-kit). See [Arena](/help/arena) for the evidence each new skill needs.
