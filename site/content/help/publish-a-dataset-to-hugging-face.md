---
title: Publish a dataset to Hugging Face
date: 2026-11-12
collection: simulate-and-train
type: task
covers:
  - src/components/settings/AccountsPane.tsx
  - src/components/simulate/ResultsSection.tsx
  - src/workspace/useDatasetExport.ts
  - src/workspace/caseCommands.tsx
  - electron/hub/
---

Put a Case's passed tries on the Hugging Face Hub as a LeRobot dataset, where LeRobot and GR00T fine-tunes can load it. It works in the desktop app.

1. Make an access token with write access on huggingface.co, under Settings ▸ Access Tokens.
2. In Basecase, press ⌘, and choose **Accounts**.
3. Paste the token into **Access token** and press Enter. Your account name shows under it once the Hub accepts the token.

![The Accounts pane with a token saved](/help/publish-a-dataset-to-hugging-face/accounts.png)

4. Open a Case and record tries with **Try It** in the Simulate tab.
5. Once a try passes, click **Publish to Hugging Face** under Export Dataset in Results. It's also in ⌘K.

![Publish to Hugging Face in Results](/help/publish-a-dataset-to-hugging-face/results.png)

6. When the toast says the dataset is published, click **Open** to see the repo.

The dataset is public, named after the Case with a short code for the scene, and tagged v2.1 so LeRobot can load it. Publishing the same Case from the same scene again replaces that dataset with the tries that pass now. Tries recorded before the robot last changed are left out, and the toast says how many.
