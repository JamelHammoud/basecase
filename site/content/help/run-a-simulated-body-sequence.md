---
title: Run a simulated body sequence
date: 2026-11-21
collection: operate
type: task
covers:
  - src/components/operate/BodySimulatedSequence.tsx
  - src/components/operate/BodySequenceRounds.tsx
  - src/components/operate/BodyRunObservations.tsx
  - src/workspace/useBodySequence.ts
  - src/workspace/bodySequenceAction.ts
  - src/workspace/bodySequenceFitAction.ts
  - src/reality/bodySequence.ts
  - src/reality/bodySequenceRecording.ts
---

Gather simulated observations for unresolved body parameters and keep their recordings for an independent fit check.

This runs MuJoCo body dynamics in the desktop app. Ordinary servo-emulator recordings can’t establish body mass, payload or floor contact.

1. In **Library**, open a retained try with body-dynamics evidence.
2. In **Play**, open **Operate**.
3. In the body controls, click **Analyze Try**.
4. In **Try**, choose the retained recording.
5. Click **Analyze**.
6. Beside each unresolved parameter you want to investigate, turn on its switch.
7. Click **Simulated Sequence**.
8. Below the declared budgets, click **Run**.

![Declared sequence budgets for the retained arm](/help/run-a-simulated-body-sequence/bounds.png)

9. Click a completed round's row to expand its contribution and observations.

![Two retained rounds after stopping the sequence, with the first round expanded](/help/run-a-simulated-body-sequence/stopped.png)

10. In that round, click its recording identifier to inspect the original observation.

![The original simulated joint observations from a retained recording](/help/run-a-simulated-body-sequence/recording.png)

The default limits are four rounds, eight trajectory seconds, one million physics steps and 128 MiB of retained storage. The duration includes a two-second validation observation, so it allows up to three two-second experiment observations.

Source snapshots are limited to 3 MiB, and each numerical sequence state is limited to 4 MiB.

**Stop** keeps completed rounds. Choosing the source try again reopens its saved sequence without running more physics. A source edit leaves its history readable and disables further execution and fitting.

In **Method**, **Validation** opens the independent recording frozen before selection. Its observations never choose a motion or enter the fit's training data.

In the saved sequence, click **Fit Body** to check the accumulated observations against that independent trajectory. An inconclusive result keeps the incumbent calibration active. See [Fit a robot's body from a recorded run](/help/fit-a-robots-body-from-a-recorded-run) for acceptance and rollback.

![The stopped sequence after an inconclusive independent fit check](/help/run-a-simulated-body-sequence/validation.png)
