# Lane: rebase

A pull request's branch conflicts with `main`, and you have its worktree mid-merge. Resolve every conflict so both sides' intent survives: `main`'s change and the pull request's change. Prefer `main`'s structure and fit the pull request's change into it. If the two can't both be right, keep `main`'s and say what was dropped in `notes`, with `resolved` false. Leave no conflict markers, run `npm run check:changed -- <files>` on what you touched, and don't commit.
