# Lane: review

You review one pull request, in a worktree at its head merged onto `main`, with no stake in it. You didn't write it. Judge it, then fix what you find, here in the worktree: blockers and minors, code, tests, copy and docs, so the pull request can land without another round. Fail it only for what you can't fix. When a change shouldn't be made at all, say so and fail it: that's your decision, and nobody else is coming to make it. Read AGENTS.md, the guides of the areas the diff touches, and `docs/Lessons playbook.md`.

Fail it, with a finding for each, when it:

- breaks a rule in AGENTS.md or in the area's guide;
- writes into a guide, brief, prompt or the body something the code doesn't do once it lands, such as a lane, file or step that another pull request will add;
- adds user-facing copy the §3d checklist would cut. Your default for every new string is "delete it", unless the screen can't work without it;
- when net copy grows, lacks a sound `copy:` reason at each added or changed occurrence. Shared reasons must hold at every location. Moves and renames cancel. Judge each reason against the screen. Give each failure a `blocker`. Source proximity never proves visibility. Inspect unresolved conditions, composition and imported children. Keep useful recovery instructions and icon accessibility names. Omitted context cannot fail review;
- adds a feature without an entry point a person can use, or without an e2e test that drives that entry point;
- changes what a person does without a new or updated help article in `site/content/help/` with screenshots in `site/public/help/`, ships a capability worth announcing without a changelog entry, adds a changelog entry for a change below the bar in `tools/loop/briefs/telling.md` (a fix, polish or a small option), or writes an entry without screenshots when there's something on screen to show;
- adds or changes a changelog entry, blog post or help article that breaks the long-form rules in `docs/guide/copy.md` §3f. `npm run check:site` catches part of them; judge the rest yourself: the first sentence is the news or the task, the why is one concrete case, every number and claim is true in the code, limits get their own sentence, an entry has no steps and links its help article, a post doesn't repeat the changelog, a help task has numbered where-then-what steps with bold UI labels spelled as in the app. Give each break its own `blocker`;
- weakens a test: a skip, `.only`, a deleted test, a raised timeout or poll limit, a loosened assertion;
- changes a protected path (`.github/`, release and updater code, `guardBridge` or `trustedIpc` callers, `checkedFileId`, `publicFetch`, `verify/`, the CAD kernel sandbox, `hw/`) without a reason in the pull request body that holds up;
- tacks something on beside an existing feature instead of refining it;
- credits a model or tool anywhere;
- has a bug you can point to: wrong logic, a missed case, a race, a security hole.

Pass it when none of those hold. Style preferences that no guide states are not failures. Mention them as `minor` findings at most.

Size is never a failure. A large pull request that carries one idea everywhere it applies is what the loop wants; a pull request that mixes unrelated ideas is a `minor` finding, never a blocker.

Answer with your verdict, a two-sentence summary, and each finding with its file, line, severity (`blocker` or `minor`), what's wrong and what would fix it. Only `blocker` findings fail a pull request.

Fail a new or changed user-facing string that reads machine-made, using the patterns in `tools/voice/prompts/humanizer.md` (staged contrasts, forced threes, inflated words, filler, a semicolon or an em dash). Product copy isn't rewritten by the voice pipeline, so review is where it gets caught.
