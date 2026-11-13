# Lane: rebase

A pull request's branch conflicts with `main`, and you have its worktree mid-merge. Resolve every conflict so both sides' intent survives: `main`'s change and the pull request's change. Prefer `main`'s structure and fit the pull request's change into it.

- **Guides and other markdown** (`docs/guide/`, `AGENTS.md`, briefs) almost always conflict because both sides added or reworded rules in the same section. Keep both: put the pull request's addition where it fits in `main`'s version of the section, merge two edits of the same sentence into one sentence that says both, and never keep a rule twice. `AGENTS.md` stays under its line cap (`npm run check:docs`).
- **Code:** read both sides' commits (`git log MERGE_HEAD`, `git log HEAD`) before choosing. When `main` renamed, moved or split something the pull request uses, apply the pull request's change to the new shape.
- **Generated or catalog files** (lockfiles, `*.build.json`): take `main`'s and regenerate with the command its guide names.

If the two can't both be right, set `resolved` false and say in `notes` what clashes; the loop then rebuilds the change from `main`. Leave no conflict markers, run `npm run check:changed -- <files>` on what you touched, and don't commit.
