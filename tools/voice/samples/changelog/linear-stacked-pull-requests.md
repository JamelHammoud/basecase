# Linear changelog: Stacked pull requests

October 8, 2026

## Stacked pull requests

Stacked pull requests are now displayed in Linear Diffs. Move through a stack and see review, CI, and merge status at a glance. Related PRs are grouped into a single collapsible row in Reviews, alongside their issue and project context.

For GitHub-native stacks, you can preview every affected PR before merging the current PR and those below from Linear.

Learn more in our documentation.

## View code changes as the agent works

Diffs now update in realtime throughout a Linear coding session, including uncommitted changes from follow-up prompts. You can follow the code as it evolves, catch wrong turns earlier, and steer the agent before or after a pull request is opened.

## AI credit usage explorer and spend limits

Admins can now see what’s driving AI credit usage and set limits to manage spend.

The new usage explorer breaks down spend by team, feature, user, or loop across any time period. Compare total spend, session count, and average spend per session, then select a group in the chart or table for a closer look.

You can also set spend limits at the workspace, user, or loop level to keep usage within the bounds you choose. When a limit is reached, additional AI credit usage is paused until the limit resets or an admin increases it.

Billing admins and owners can access both features in Usage & Limits. Learn more about AI credits in our documentation.

## Guided Reviews on Basic

Guides walk you through the most important changes in a pull request. They’re now available on Basic plans.

## Fixes
- Asks: Fixed duplicate text in issue descriptions created from Slack messages
- Diffs: Stopped sending notifications for Codex reviews without inline code comments
- Diffs: Fixed review submissions failing when file review changes were still saving
- Diffs: Hidden running Codex review summaries and notified when reviews completed
- Diffs: Kept published review comments on unchanged lines current when edits shifted their position
- Diffs: Fixed closing search resetting the scroll position after opening a result in a collapsed file
- Diffs: Fixed approvals reverting during GitHub sync
- Diffs: Added confirmation before merging a pull request when you are not responsible for merging it
- Editor: Fixed document printing from intercepting macOS text navigation
- Editor: Fixed Backspace undo for automatically created mentions
- GitHub: Fixed repeated sync errors when a sub-issue was already attached to its intended GitHub parent
- Imports: Fixed showing permission errors during Linear imports instead of leaving team selection loading
- Initiatives: Fixed the new initiative form appearing below the list instead of at the top
- Issues: Fixed agent status badges not showing on unassigned delegated issues when the session needs attention

## Improvements
- Coding Sessions: Improved management capabilities for environment owners
- Coding Sessions: Added Claude Sonnet 5.5 as a coding session model
- Diffs: Added previous and next controls to jump between Guide sections without marking them reviewed
- Diffs: Added a merge confirmation in case there are failed non-required checks
- Documents: Added [[ to find or create documents inline, plus a “Create new document” slash command that attaches the document to the current context
- GitHub: Added coding-session static IPs to Linear’s published GitHub allowlist
- Imports: Linear-to-Linear imports now let you choose which workspace issue labels, project labels, initiative labels, templates, and project statuses to copy
- Imports: Linear-to-Linear imports can now include a parent team without some or all of its sub-teams
- Integrations: GitHub issue priority is now a synced property
- Integrations: Added settings to update the GitLab token and enable automatic renewal (self-rotation of tokens)
