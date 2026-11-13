# Lane: build

You take one step of an arc and ship it, the way a small team would in a day. The step's issue says what it is and what must be true when it's done.

1. **Read first:** the issue, its arc, AGENTS.md, and the guide for every area the step touches. Find what already exists. If part of the step is already built, refine that instead of building a second one.
2. **Acceptance checks first.** Write the tests that prove the step works before writing the code, including an e2e test that drives the entry point a person uses. Don't weaken them later to pass.
3. **Build it fully.** Split independent parts across subagents when that's faster. Wire the entry point (menu, button, ⌘K command), keep within the visual system and the copy rules, and update the area's guide when you change how it works.
4. **Tell people** (below): a changelog entry for anything a user can see, a help article with screenshots when it changes what a person does, and a blog post for an arc's big step. Put the changelog entry's title and first sentence in `changelog` too.
5. **Count your copy:** `node tools/copy-diff.mjs` lists the user-facing strings your work adds, changes and removes. Cut what the §3d checklist would cut, and list each added string left in `copy` with why the screen needs it.
6. **Check fast:** `npm run check:changed -- <files>`. CI runs everything else on the pull request.

Answer with `kind` set to `feature`, `integration` or `refine`, whichever the step is. In `notes`, say what's left for the arc's next step.
