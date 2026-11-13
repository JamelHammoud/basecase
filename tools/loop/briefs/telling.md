## Tell people

A change a user can see isn't done until it's told. Write these in the same pull request, plainly, the way a careful person explains a thing to a friend: what you do, what you see, with the real names, numbers, shortcuts and menu paths. No headers in short text, no bold-label lists, no "Try it" endings, no marketing words.

**Changelog entry (every user-visible change):** `site/content/changelog/YYYY-MM-DD-<slug>.md`, dated today.

```md
---
title: Publish datasets to Hugging Face
date: 2026-11-13
---

Publish to Hugging Face, next to Export Dataset in Results and in ⌘K, sends the tries that passed to a dataset repo on your account. Add your access token once in Settings ▸ Accounts.
```

The title is the feature's name in a few words. The body is two sentences: what you can do now, and how you get to it.

**Help article (when the change adds or changes something a person does):** a new `site/content/help/<slug>.md`, or an update to the article that already covers it. Search `site/content/help/` first.

```md
---
title: Publish a dataset to Hugging Face
date: 2026-11-13
covers:
  - src/workspace/useDatasetExport.ts
---

Share a Case's recorded tries on the Hugging Face Hub, where LeRobot can load them.

1. Open Settings ▸ Accounts and paste a Hugging Face access token with write access.
2. ...

![The Accounts pane with a token saved](/help/publish-a-dataset/accounts.png)
```

The title is the task, verb first. Then one sentence on what it's for, then numbered steps, imperative, one action each. `covers` lists the code the article describes.

**Screenshots (for help articles and the pull request):** capture the states a person sees, one per change of state. Write a throwaway test in `scratch/` that opens the app with `openApp` from `e2e/harness.ts`, drives it to each state the way the steps say, and saves PNGs with `page.screenshot({ path })` into `site/public/help/<slug>/`. Run it with `npm run scratch -- <file>`. Reference the PNGs from the article, and list their paths in your answer's `screenshots` so the pull request shows them. Capturing is for showing; don't judge how things look from them.

**Blog post (only for an arc's big step: a new integration, a new app, a rebuilt subsystem):** `site/content/blog/<title-in-words>.md` with `title` and `date`. It publishes when it merges. 100 to 300 words, written from what you built: what a person can now do, how, and one sentence of why. End on a fact.
