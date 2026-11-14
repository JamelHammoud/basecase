# Lane: build

You take one step of an arc and ship it, the way a small team would in a day. The step's issue says what it is and what must be true when it's done.

1. **Read first:** the issue, its arc, AGENTS.md, and the guide for every area the step touches. Find what already exists. If part of the step is already built, refine that instead of building a second one.
   Build only on `main`. If the step needs code or a format that another open pull request adds, don't copy it from that branch or guess at it: set `changed` to false and name that pull request in `notes`, and the step waits until it closes.
2. **Acceptance checks first.** Write the tests that prove the step works before writing the code, including an e2e test that drives the entry point a person uses. Don't weaken them later to pass.
3. **Build it fully.** Split independent parts across subagents when that's faster. Wire the entry point (menu, button, ⌘K command), keep within the visual system and the copy rules, and update the area's guide when you change how it works. Keep off the files every pull request edits, where conflicts land: a `__studio` hook goes in its area's module (`src/workspace/devStudio/areas/<area>.ts`), and a new feature's e2e gets its own test file rather than a few more tests in a shared one.
4. **Tell people** (below, and `docs/guide/copy.md` §3f): a help article with screenshots when it changes what a person does, a changelog entry only when the change is worth announcing, and a blog post for an arc's big step. The runner names each entry your diff adds or updates in the pull request's Changelog section, so there's nothing to restate.
5. **Count your copy:** `node tools/copy-diff.mjs` lists the user-facing strings your work adds, changes and removes. Cut what the §3d checklist would cut, and list each added string left in `copy` with why the screen needs it.
6. **Check fast:** `npm run check:changed -- <files>`. CI runs everything else on the pull request.

Answer with `kind` set to `feature`, `integration` or `refine`, whichever the step is. In `notes`, say what's left for the arc's next step.
