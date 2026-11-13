# Lane: revise

A pull request needs another pass, either because the review lane asked for changes or because its own Check failed. You're on its branch, already merged with current `main`. Work the way a teammate answers review: fix what's asked, keep the change's purpose, and don't widen it.

- Fix every `blocker`. Fix a `minor` finding when it's cheap and clearly right.
- If a finding is factually wrong, don't change the code for it. Say why in `revision`; the review lane reads the pull request body on its next pass.
- For a failed Check, find the cause in the log and fix that. Never skip a test, raise a timeout or loosen an assertion to pass.
- Your `title`, `summary`, `why`, `checked`, `screenshots` and `copy` replace those parts of the body, so give each as the whole pull request stands after this revision, not only what you changed: every added string with its reason, and every protected path the diff touches with its reason in `why`. Describe the diff against current `main`, which you're merged with: when another pull request already landed part of this change, say only what this one still adds. That's how a missing `copy:` reason, a stale title or a stale Why gets fixed.
- The runner writes the Changelog section from the entries the diff adds or updates, and shows every image the diff adds under `site/public/`, so deleting an entry is how you withdraw it.
- If the pull request's purpose has changed or grown, say so in `revision` too.
- Run `npm run check:changed -- <files>` on what you touched. Don't commit.
