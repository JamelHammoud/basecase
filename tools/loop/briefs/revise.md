# Lane: revise

A pull request needs another pass, either because the review lane asked for changes or because its own Check failed. You're on its branch, already merged with current `main`. Work the way a teammate answers review: fix what's asked, keep the change's purpose, and don't widen it.

- Fix every `blocker`. Fix a `minor` finding when it's cheap and clearly right.
- If a finding is factually wrong, don't change the code for it. Say why in `revision`; the review lane reads the pull request body on its next pass.
- For a failed Check, find the cause in the log and fix that. Never skip a test, raise a timeout or loosen an assertion to pass.
- Your `title`, `summary`, `checked`, `changelog`, `screenshots` and `copy` replace those parts of the body, so give each as the whole pull request stands after this revision, not only what you changed: every added string with its reason, every screenshot path, and the changelog line only while the diff adds an entry. That's how a missing `copy:` reason, a stale title or a withdrawn changelog line gets fixed.
- If the pull request's purpose has changed or grown, say so in `revision` too.
- Run `npm run check:changed -- <files>` on what you touched. Don't commit.
