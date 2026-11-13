## Tell people

A change that adds or changes what a person does isn't done until it's told, in the same pull request. Every changelog entry, post and help article follows the long-form rules in `docs/guide/copy.md` §3f: read them before you write, and run `npm run check:site` (or `npm run check:changed -- <files>`), which fails what the rules can check. Review fails a page that breaks any of the rest. The short version:

- The first sentence is the news or the task. The person or the problem comes first, the menu path second.
- Sentences of 25 words or fewer, one claim each. Paragraphs of 5 sentences or fewer.
- The why is one concrete case. Numbers are real, read from the code or measured. Limits get their own sentence, early.
- Show the real thing: screenshots of each state, real names, files and links.
- No marketing words, no "Try it", no link text like "here" or "Learn more". Check every claim in the code.

**Changelog entry (only for a change worth announcing):** `site/content/changelog/YYYY-MM-DD-<slug>.md`, dated today. The bar: a new capability, a new way of working, or a change in how the product behaves that a regular user would tell a friend about. Most pull requests don't clear it. Fixes, polish, refinements, faster loads, renames, a moved control and one more option never get an entry; the release notes list every merged pull request. When in doubt, leave it out. Two features are two entries; several steps of one arc share one, written by the step that makes it usable. If the feature already has an entry, update it.

```md
---
title: Calibrate servos
date: 2026-11-12
image: /changelog/calibrate-servos/cover.png
---

You can now fit each servo's model from an 18-second bench run, so simulation moves the way your servos do. It works on the emulated robot; real servos stay locked.

Every servo starts from its catalog preset. A real unit lags, sticks and sags in its own way, and a policy trained on the preset meets a different arm when it runs.

...

Steps are in [Calibrate an emulated robot](/help/calibrate-an-emulated-robot).
```

- **The title** is what you can now do, in the feature's words, sentence case.
- **The first paragraph** is one or two sentences that stand alone in the list.
- **The rest** is 60 to 250 words, in this order: where it is, the one case that's why, how it behaves with numbers, the limits, then the help article linked by its title. No steps: they're in the help article. `##` headings only past 250 words, and up to 500 only for a decision, a cost or a reversal worth telling.
- **Screenshots.** `image:` is a cover screenshot of the feature in use; add a body image only for a state the cover doesn't show, with alt text that says what's on screen. Capture them like help screenshots (below), into `site/public/changelog/<file name without the date>/`. Leave them out only when there's nothing on screen, and say why in `notes`.

**Help article (when the change adds or changes something a person does):** a new `site/content/help/<slug>.md`, or an update to the article that already covers it. Search `site/content/help/` first. Pick its type (§3f): most are tasks.

```md
---
title: Publish a dataset to Hugging Face
date: 2026-11-13
covers:
  - src/workspace/useDatasetExport.ts
---

Put a Case's passed tries on the Hugging Face Hub, where LeRobot and GR00T can train on them.

1. Press ⌘, and choose **Accounts**.
2. Paste a token with write access into **Access token**, and press Enter.
3. ...

![The Accounts pane with a token saved](/help/publish-a-dataset-to-hugging-face/accounts.png)
```

A task's title starts with its verb. Then one sentence of 160 characters or fewer on what it's for, then numbered steps: one action each, where before what, every UI label in bold as the app spells it. Alternatives (⌘K, a drop) go after the steps. Link the concept or the next task where it helps. `covers` lists the code the article describes.

**Screenshots (for changelog entries, help articles and the pull request):** capture the states a person sees, one per change of state. Write a throwaway test in `scratch/` that opens the app with `openApp` from `e2e/harness.ts`, drives it to each state the way the steps say, and saves PNGs with `page.screenshot({ path })` into `site/public/help/<slug>/` or `site/public/changelog/<slug>/`. Run it with `npm run scratch -- <file>`. Reference the PNGs from the article, and list their paths in your answer's `screenshots` so the pull request shows them. Capturing is for showing; don't judge how things look from them.

**Blog post (only for an arc's big step: a new integration, a new app, a rebuilt subsystem, and only when there's a story the changelog can't hold):** `site/content/blog/<title-in-words>.md` with `title` and `date`. It publishes when it merges. 400 to 1,500 words under `##` headings, written first-hand with "we" for the people who build Basecase: the news first, then the problem as one concrete case, each choice with the alternative it beat, real numbers, what it costs or doesn't do, and the help article. Link the changelog entry instead of repeating it; `check:site` fails a sentence copied from it.
