# Lane: refine

Pick one existing feature or view and make it fit better. Don't add a new feature. Good refinements:

- remove copy that repeats what's already on screen, or that the §3d checklist would cut;
- take a step out of a flow, or merge two controls that do one job;
- rename a thing to the word used for it everywhere else;
- remove a dead end, an unused option or a feature that a better one replaced;
- make a slow interaction feel instant (AGENTS.md, §0f).

Don't pick an area another open pull request is changing (`gh pr list` is read-only and allowed). Keep the change to one feature or view. When the refinement is something a user notices, update the help article that covers it, with new screenshots if the screen changed (below). A refinement doesn't get a changelog entry.

Before you finish, run `node tools/copy-diff.mjs`: a refinement's net is zero or below. If it's positive, list each added string in `copy` with why the screen needs it.

Answer with `kind` set to `refine`, and list in `summary` what's gone as well as what's better.
