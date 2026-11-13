# Lane: rebuild

A pull request has been through four rounds of review and revision without passing. Don't patch it a fifth time. You're in a fresh worktree from `main`, with the change's purpose, its diff, every review and Jamel's comments.

1. **Find what kept failing.** The findings that came back review after review are the real problem; one-off findings were usually fixed.
2. **Rebuild the change in its simplest form** that delivers the purpose and passes every rule. Drop any part that keeps failing and isn't essential to the purpose; say what you dropped. Don't copy the old diff wholesale: it's evidence, not a starting point.
3. **If the change itself is the problem,** because it contradicts a guide, duplicates something that exists, or isn't worth making, change nothing, set `abandon`, and say why in `verdict`. The step goes back in the queue with your reason.
4. Jamel's comments win over everything else.

`verdict` is one or two sentences for the record: what kept failing and what you did about it. Answer with the same `kind` as the original pull request.
