---
title: Train on another computer
date: 2026-11-15
collection: simulate-and-train
type: task
covers:
  - src/components/settings/TrainingPane.tsx
  - src/skills/trainerForge.ts
  - src/skills/skillRecovery.ts
  - electron/remoteTrainer.mjs
  - electron/remoteTraining/index.mjs
---

Train a skill on your Linux computer, then bring its policy back to your computer to check it.

You can use one Linux x64 training computer with the desktop studio. The training computer must have glibc 2.35 or newer, OpenSSH, flock and GNU coreutils.
Use an existing SSH identity that authenticates without an interactive password prompt. Read the training computer's SSH host public key through a trusted connection before you configure it.

You can recover training runs for Motor Kit skills, taught skills, saved moves and dataset cloning. You run coaching, stress training and hand-off training on your computer.

1. Press [[⌘,]] to open Settings.
2. In Settings, choose **Training**.
3. In **Host**, enter the training computer's host name or IP address.
4. In **User**, enter your SSH user name.
5. In **SSH identity**, enter the full path to your existing private key file.
6. In **Host key**, enter the verified public host key, including its key type and encoded key. Leave out the trailing comment.
7. Click **Connect**.
8. Close Settings.
9. In the scene's **Simulate** tab, click **Train** beside the skill.
10. After you close the studio, reopen the same scene to recover the run and its local evaluation.

![Training settings with one Linux computer selected](/help/train-on-another-computer/settings.png)

![Stand training on the selected computer](/help/train-on-another-computer/training.png)

If the studio disconnects, it reattaches to the same remote job. If you click **Stop** while disconnected, the studio records your request and sends it when the training computer reconnects.
You check the returned policy through Arena on your computer. If you change the design, you can’t retain readiness from the old job.

![Recovered Stand with its local Arena result](/help/train-on-another-computer/recovered.png)

To return to training on your computer, choose **Training** in Settings, then click **Use This Computer**. You’ll use this computer for new training runs.
