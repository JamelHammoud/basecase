# How AI companies structure instructions for coding agents

Research behind how this repo keeps its rules ([AGENTS.md](../../AGENTS.md), [`docs/guide/`](../guide/), nested `AGENTS.md` files, [`tools/check-docs.mjs`](../../tools/check-docs.mjs)). Read on 2026-11-01 from each company's own documentation or engineering blog; quotes are verbatim. Recheck the sources when a tool changes how it loads instructions.

## OpenAI

**Harness engineering** (engineering blog, 2026-02-11; [source](https://openai.com/index/harness-engineering/)). A team built a product of about a million lines written entirely by Codex. On instructions:

- They tried “one big AGENTS.md” and it “failed in predictable ways”: “Context is a scarce resource. A giant instruction file crowds out the task, the code, and the relevant docs”; “Too much guidance becomes non-guidance. When everything is ‘important,’ nothing is”; “It rots instantly … a graveyard of stale rules”; “It’s hard to verify. A single blob doesn’t lend itself to mechanical checks (coverage, freshness, ownership, cross-links)”.
- “Instead of treating AGENTS.md as the encyclopedia, we treat it as the table of contents.” A short AGENTS.md (“roughly 100 lines”) is “a map, with pointers to deeper sources of truth”; the knowledge base is a structured `docs/` directory “treated as the system of record” (design docs, product specs, plans, references, quality and security docs).
- Progressive disclosure: “agents start with a small, stable entry point and are taught where to look next.”
- “We enforce this mechanically. Dedicated linters and CI jobs validate that the knowledge base is up to date, cross-linked, and structured correctly”, plus a recurring “doc-gardening” agent that opens fix-up pull requests for stale docs.
- “From the agent’s point of view, anything it can’t access in-context while running effectively doesn’t exist. Knowledge that lives in Google Docs, chat threads, or people’s heads are not accessible.” Decisions made in chat get written into the repo.
- Taste and invariants are promoted into custom lints whose error messages carry the fix (“we write the error messages to inject remediation instructions into agent context”). “When documentation falls short, we promote the rule into code.”

**Codex AGENTS.md docs** ([source](https://learn.chatgpt.com/docs/agent-configuration/agents-md)):

- Codex walks from the repository root down to the working directory and reads at most one file per directory (`AGENTS.override.md`, then `AGENTS.md`), concatenated root first; “Files closer to your current directory override earlier guidance because they appear later in the combined prompt.”
- `project_doc_max_bytes` defaults to **32 KiB**; Codex “stops adding files once the combined size reaches the limit.” Our old 229 KB AGENTS.md was cut off for every Codex user.
- Advice: “Keep rules concise”, “reserve formatting and lint checks for CI”, put repository-wide checks at the root and area-specific ones in nested files, and split large files across nested directories to avoid truncation.

**AGENTS.md standard** ([agents.md](https://agents.md/), now stewarded by the Agentic AI Foundation under the Linux Foundation): plain Markdown, no required fields; read by Codex, Cursor, Copilot's coding agent, Gemini CLI, Jules, Devin, Zed, Warp, Windsurf and others. For large repos, nest one per area: “The closest AGENTS.md to the edited file wins; explicit user chat prompts override everything.” OpenAI's own main repo has 88 of them.

## Anthropic

**Claude Code memory docs** ([source](https://code.claude.com/docs/en/memory)):

- Claude Code reads `AGENTS.md` natively when the repo has no `CLAUDE.md` (v2.1.277+): every `AGENTS.md` from the working directory up at launch, and a subdirectory's `AGENTS.md` when Claude opens a file there. With a `CLAUDE.md` present it reads only `CLAUDE.md` files (unless they import `@AGENTS.md`), so adding one would hide our nested files. It never reads anything under `.agents/`.
- “Size: target under 200 lines per CLAUDE.md file. Longer files consume more context and reduce adherence.” Instructions that matter for one part of the codebase move to path-scoped rules or subdirectory files that load only when needed.
- “If two instructions contradict each other, Claude may pick one arbitrarily.” Review the files periodically for stale or conflicting rules.
- Auto memory (notes Claude keeps for itself) is per machine and per user; team rules belong in the committed file.

**Best practices** ([source](https://code.claude.com/docs/en/best-practices)):

- “Every line in it takes a little of Claude's attention on every task, whether it's relevant or not”, so it holds only what can't be worked out from the code. Don't describe the architecture or file layout: “Claude reads the repo itself. Only write down what isn't in there.”
- No IMPORTANT or ALL CAPS: “piling on emphasis mostly makes Claude over-apply the rule.” A rule that can't have exceptions belongs in a hook, deny rule or CI check: “If something has to happen every time, make it a hook … CLAUDE.md is for guidelines.”
- Team procedures (a release, a runbook) go in skills, which cost only their name and description until used.

**Large codebases** ([source](https://code.claude.com/docs/en/large-codebases)): split into a root file with rules that apply everywhere and per-subsystem files (“one per subsystem such as `src/db/` or `src/api/`”), versioned with the code and reviewed in pull requests; revisit them after major model releases, since workarounds for an older model become overhead.

**Skills** ([source](https://code.claude.com/docs/en/skills)): “Keep `SKILL.md` under 500 lines. Move detailed reference material to separate files.” The description leads with what the skill does and when to use it, since only names and descriptions are always loaded.

## Google

**Gemini CLI context files** ([source](https://geminicli.com/docs/cli/gemini-md/)): `GEMINI.md` files are loaded globally, from the workspace and its parents, and just in time from any directory a tool touches; all are concatenated and sent with every prompt. Large files are split with `@file.md` imports. `context.fileName` can be set to `["AGENTS.md", …]` so the CLI reads AGENTS.md. Google replaced Gemini CLI with Antigravity on 2026-06-18; its docs weren't reachable for this note, so Antigravity's behaviour isn't recorded here.

## GitHub

**Copilot repository instructions** ([source](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions)): a repository-wide `.github/copilot-instructions.md`, path-specific `.github/instructions/*.instructions.md` with an `applyTo` glob, and `AGENTS.md` anywhere in the tree: “the nearest `AGENTS.md` file in the directory tree will take precedence.” All matching sets are sent together, so “try to avoid providing conflicting sets of instructions.” Their onboarding template caps the file at two pages and says instructions “must not be task specific”.

## Cursor

**Rules** ([source](https://cursor.com/docs/context/rules)): project rules in `.cursor/rules/*.mdc` (always, by description, by glob or manual); `AGENTS.md` in the root and subdirectories, nested ones combined with their parents. “Keep rules under 500 lines”, “Split large rules into multiple, composable rules”, “Good rules are focused, actionable, and scoped”, “Reference files instead of copying their contents”, and “Add rules only when you notice Agent making the same mistake repeatedly.”

## What every source agrees on

1. **A short entry file that's a map.** About 100 lines (OpenAI), under 200 (Anthropic), two pages (GitHub), under 32 KiB or Codex cuts it off.
2. **Detail lives in the repo, loaded when needed**: a `docs/` system of record, nested per-area files, path-scoped rules or skills.
3. **Nested `AGENTS.md` is the one scoping mechanism every tool reads** (Codex, Claude Code, Cursor, Copilot, Gemini CLI with `context.fileName`). Tool-specific scoping (`.claude/rules`, `.cursor/rules`, `.github/instructions`) only reaches one tool.
4. **The repo is the only memory that counts.** Rules from chats and reviews get written into the repo, not kept in someone's head or an agent's private memory.
5. **Enforce what must always hold** with lints, hooks and CI, and check the docs themselves mechanically (size, links, coverage).
6. **Write only what the code can't tell**, plainly, without emphasis, with no contradictions, and prune it when models or code change.

## How Basecase applies it

- [AGENTS.md](../../AGENTS.md) is the map: what Basecase is, the working agreements, the rules every change keeps, an index of guides, and the verification checklist. Under 200 lines and 32 KiB.
- [`docs/guide/`](../guide/) is the system of record for each area, with section numbers (§) shared across files so references stay stable.
- Each code area has a short nested `AGENTS.md` that names the guide to read before editing there, so every tool loads the pointer when it works in that folder.
- Procedures stay skills in `.agents/skills/` (linked to `.claude/skills/`).
- `npm run check` runs [`tools/check-docs.mjs`](../../tools/check-docs.mjs): AGENTS.md stays under 200 lines and 32 KiB, every guide is in the index, and every Markdown link and § reference in the rules resolves.
- No `CLAUDE.md`: Claude Code reads AGENTS.md directly, and a `CLAUDE.md` would stop it reading the nested files.
- Rules a maintainer gives in chat go straight into AGENTS.md or a guide, never only into an agent's private memory.
