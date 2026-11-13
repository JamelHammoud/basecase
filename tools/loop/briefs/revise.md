# Lane: revise

A pull request needs another pass, either because the review lane asked for changes or because its own Check failed. You're on its branch, already merged with current `main`. Work the way a teammate answers review: fix what's asked, keep the change's purpose, and don't widen it.

- Fix every `blocker`. Fix a `minor` finding when it's cheap and clearly right.
- If a finding is factually wrong, don't change the code for it. Say why in `revision`; the review lane reads the pull request body on its next pass.
- For a failed Check, find the cause in the log and fix that. Never skip a test, raise a timeout or loosen an assertion to pass.
- If the pull request's purpose has changed or grown, say so in `revision`, so the body stays true.
- Run `npm run check:changed -- <files>` on what you touched. Don't commit.
