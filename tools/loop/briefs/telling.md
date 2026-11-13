## Tell people

A change that adds or changes what a person does isn't done until it's told. Write these in the same pull request, plainly, the way a careful person explains a thing to a friend: what you do, what you see, with the real names, numbers, shortcuts and menu paths. No headers in short text, no bold-label lists, no "Try it" endings, no marketing words.

**Changelog entry (only for a change worth announcing):** `site/content/changelog/YYYY-MM-DD-<slug>.md`, dated today. The bar is Amp's Chronicle: a new capability, a new way of working, or a change in how the product behaves that a regular user would tell a friend about. Most pull requests don't clear it. Fixes, polish, refinements, faster loads, renamed labels and one more option in a menu never get an entry; the release notes already list every merged pull request. When in doubt, leave it out. Several steps of one arc share one entry, written by the step that makes it usable.

```md
---
title: Publish datasets to Hugging Face
date: 2026-11-13
image: /changelog/publish-datasets-to-hugging-face/cover.png
---

Publish to Hugging Face sends a Case's passing tries to a dataset repo on your account, where LeRobot can load them.

## Where it is

It sits next to Export Dataset in Results, and in ⌘K. The first time, it asks for an access token with write access, which it keeps in Settings ▸ Accounts.

![Results with Publish to Hugging Face beside Export Dataset](/changelog/publish-datasets-to-hugging-face/results.png)

## What gets sent

...
```

Each entry is its own page at `/changelog/<file name>`, and the changelog lists its cover, date, title and first paragraph. So:

- **The title** is the feature's name in a few words, sentence case.
- **The first paragraph** is one or two sentences that stand alone in the list: what you can do now.
- **The rest** is 150 to 500 words under short `##` headings that name what each part covers: where it is, how it works, what it replaces, what it doesn't do yet. Write it the way Amp's Chronicle does: plain, specific, first-hand, with real names, numbers and menu paths, and no marketing.
- **Screenshots, nearly always.** `image:` is a cover screenshot of the feature in use, and the body shows each state a person meets, one image per state, with alt text that says what's on screen. Capture them like help screenshots (below), into `site/public/changelog/<file name without the date>/`. Leave them out only when there's nothing on screen to show, and say why in `notes`.
- If an entry for the same feature is already in the folder, update it instead of adding another.

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

**Screenshots (for changelog entries, help articles and the pull request):** capture the states a person sees, one per change of state. Write a throwaway test in `scratch/` that opens the app with `openApp` from `e2e/harness.ts`, drives it to each state the way the steps say, and saves PNGs with `page.screenshot({ path })` into `site/public/help/<slug>/` or `site/public/changelog/<slug>/`. Run it with `npm run scratch -- <file>`. Reference the PNGs from the article, and list their paths in your answer's `screenshots` so the pull request shows them. Capturing is for showing; don't judge how things look from them.

**Blog post (only for an arc's big step: a new integration, a new app, a rebuilt subsystem):** `site/content/blog/<title-in-words>.md` with `title` and `date`. It publishes when it merges. 100 to 300 words, written from what you built: what a person can now do, how, and one sentence of why. End on a fact.
