# Blogs and changelogs: what the celebrated ones do

Research for Basecase's blog (`site/content/blog/`) and changelog (`site/content/changelog/`). Ten pieces of human-written product writing that practitioners point to as good, read in full, with what each does and what Basecase can take from them. Everything quoted here was fetched on 2026-11-13; quotes are exact apart from curly quote marks written straight, and kept under 25 words.

## How the ten were chosen

"Celebrated" here means someone who builds software said, in public and in so many words, that the piece is well written or a model to copy. The evidence is mostly Hacker News and Lobsters comments plus one practitioner article; that is thinner than a survey but it is real and linked. Listicles from companies that sell changelog tools were read but not counted as evidence.

Candidates read and dropped:

- **Amp's Chronicle** (ampcode.com/chronicle). Basecase's own brief (`tools/loop/briefs/telling.md`) names it as the bar, so one entry is studied below, but I found no practitioner praising its writing. Not counted among the ten.
- **Arc's release notes.** Reception on r/ArcBrowser is mixed: people asked for text instead of the video notes. Arc's 2025 letter to members made the list instead.
- **Vercel's changelog, Things' release notes.** Only vendor listicles praise the former; praise for Things is for the app (MacStories' "Beauty and Delight in a Task Manager"), not its notes.
- **Paul Graham, Dan Luu.** Personal essays, not product writing about a product the author ships.

## The ten

| #   | Piece                                                         | Kind                   | Date                     | Length                                       | Who praises it                               |
| --- | ------------------------------------------------------------- | ---------------------- | ------------------------ | -------------------------------------------- | -------------------------------------------- |
| 1   | Tailscale, "How NAT traversal works" (David Anderson)         | Technical explainer    | 2020-08-21               | ~8,800 words, ~22 diagrams                   | HN, posted four times, 162 to 408 points     |
| 2   | Figma, "How Figma's multiplayer technology works" (Evan Wallace) | Engineering story   | 2019-10-16               | ~3,300 words, animations                     | HN, 268 points in 2019, 176 in 2025          |
| 3   | Stripe, "Stripe's payments APIs: the first ten years" (Michelle Bu) | Product history  | 2020-12-15               | ~5,400 words, "27 min read"                  | HN, 309 points                               |
| 4   | Cloudflare, "Details of the Cloudflare outage on July 2, 2019" (John Graham-Cumming) | Incident report | 2019-07-12 | ~3,200 words plus a 1,500-word appendix | HN, 698 points                     |
| 5   | The Browser Company, "Letter to Arc members 2025" (Josh Miller) | Product-direction letter | 2025-05-26          | ~2,900 words                                 | HN                                           |
| 6   | Linear changelog, with Karri Saarinen's "Startups, Write Changelogs" | Changelog       | weekly; read Sept to Nov 2026 | 50 to 150 words per headline           | dev.to (fmerian), HN                         |
| 7   | Raycast changelog (macOS)                                     | Changelog              | weekly; v2.8 to v2.12, Oct to Nov 2026 | 30 to 130 word intro, then lists | dev.to (fmerian)                     |
| 8   | Ghostty 1.3.0 release notes                                   | Release notes          | 2026-03-09               | ~5,500 words, ~2,400 before the full list    | Lobsters                                     |
| 9   | esbuild `CHANGELOG.md` (Evan Wallace)                         | Changelog              | 0.27.3 to Unreleased     | 30 to 300 words per entry                    | HN                                           |
| 10  | CodeKit updates (Bryan Jones)                                 | Release notes          | 3.35 to 3.38, 2026       | 140 to 520 words per version                 | HN                                           |

## Blog posts

### 1. Tailscale: How NAT traversal works

<https://tailscale.com/blog/how-nat-traversal-works>, David Anderson, August 21, 2020.

**Why it's celebrated.** Posted to Hacker News at least four times with 162 to 408 points. "I submitted this because it is the best summary of NAT I have read" ([robocat](https://news.ycombinator.com/item?id=30732217)); "Really clear and clean exposition on what can be a hairy and badly-discussed subject" ([binary132](https://news.ycombinator.com/item?id=42602405)).

- **Opening.** Ties back to an earlier post, admits the gap, and promises the fix: "However, we glossed over how we can get through NATs". Then the problem in one line: "Let's start with a simple problem: establishing a peer-to-peer connection between two machines."
- **Length.** About 8,800 words. It earns the length by building one idea per section, each depending on the last.
- **Sentences and rhythm.** Mostly plain 15 to 25 word sentences, broken by very short ones that turn the argument: "…Right?" / "Well, not quite." And: "Ready? The algorithm is: try everything at once, and pick the best thing that works. That's it."
- **Person and voice.** "We" for Tailscale, "you" for the reader building their own, and "I" for first-hand experience: "In the distant past, I used XMPP chat messages as the side channel, with great results."
- **Showing the change.** Real addresses in every example ("a UDP packet leaving the laptop from 2.2.2.2:1234 to 5.5.5.5:5678"), a diagram per step, and numbers: "If we stick with a fairly modest probing rate of 100 ports/sec, half the time we'll get through in under 2 seconds."
- **The why.** Every constraint gets its reason before the technique: "You can do NAT traversal with TCP, but it adds another layer of complexity to an already quite complex problem".
- **Ending.** Admits the cost, then hands over: "This is all quite complicated!" and "But now you know how to get past that, so go build cool stuff!" Then a "TL;DR" checklist of ingredients and steps.
- **Headings.** Plain H3s for the big parts, playful alliterative H4s inside them: "Firewall face-off", "Finessing finicky firewalls", "The benefits of birthdays", "Have you considered giving up?"
- **What it leaves out.** Selling. Tailscale appears only as an example: "We'll be discussing these techniques generically, using Tailscale and others for examples where appropriate." The signup box is page chrome, not prose.

### 2. Figma: How Figma's multiplayer technology works

<https://www.figma.com/blog/how-figmas-multiplayer-technology-works/>, Evan Wallace, October 16, 2019.

**Why it's celebrated.** 268 points on HN in 2019 and 176 more when reposted in 2025. "Great write-up! Thanks for taking the time to do this." ([bhouston](https://news.ycombinator.com/item?id=21379588)).

- **Opening.** The decision, then the doubt behind it: "we decided to develop our own solution. No other design tool offered this feature". Then: "At the time, we weren't sure building this feature was the right product decision."
- **Length.** About 3,300 words, with a reading map up front: "We'll cover a lot but each section builds upon the previous ones."
- **Sentences and rhythm.** Even, explanatory, 15 to 25 words. No jokes; the clarity is the style.
- **Person and voice.** "We" throughout, "I" once at the close. Users' objections in their own words: designers feared "hovering art directors" and "design by committee" catastrophes.
- **Showing the change.** A tiny worked case beats a paragraph of theory: "If the text value is B and someone changes it to AB at the same time as someone else changes it to BC". An animation for each sync rule, and a screenshot of the internal prototype.
- **The why.** Each choice names the alternative it rejected and why: "As a startup we value the ability to ship features quickly, and OTs were unnecessarily complex for our problem space."
- **Limits.** Stated plainly, with the reason to live with them: "This solution isn't great because the object temporarily disappears, but it's a simple solution to a very rare temporary problem".
- **Ending.** States the post's purpose ("This is the post we wished we could have read when we were first starting our research."), three takeaways as bullets, then a one-line hiring note.
- **Headings.** Descriptive and parallel: "Syncing object properties", "Syncing object creation and removal", "Syncing trees of objects", "Implementing undo".
- **What it leaves out.** Benchmarks and product pitch. Postgres-backed data is set aside in one sentence as "a completely separate system that won't be discussed in this article."

### 3. Stripe: Stripe's payments APIs, the first ten years

<https://stripe.com/blog/payment-api-design> (now redirects to stripe.dev), Michelle Bu, December 15, 2020.

**Why it's celebrated.** 309 points on HN. "This is really well-written. Detailed, clear, accessible and fascinating snapshot of real-world API design best practices." ([darkteflon](https://news.ycombinator.com/item?id=25440482)).

- **Opening.** A story with a hook: "A few years ago, Bloomberg Businessweek published a feature story on Stripe. Four words spanned the center of the cover: "seven lines of code,""
- **A motif that carries the piece.** "Seven lines of code" returns at the crisis ("The new APIs didn't feel like "seven lines of code" anymore."), at the fix, and in the last section.
- **Length.** About 5,400 words, ordered as dated chapters.
- **Sentences and rhythm.** Longer, careful sentences, broken by set-off one-line claims: "A great API product stays out of the developer's way for as long as possible."
- **Person and voice.** "We" for Stripe, owning mistakes: "It was not user-centric thinking to assuage our own worries about this big API change by recommending two incompatible integration paths."
- **Showing the change.** Diagrams with captions, a quadrant table of payment methods, real curl. Numbers for the debt: "the Charge resource grew from having 11 properties to 36 properties". One image for the whole problem: "It's as if we were trying to build a spaceship by adding parts to a car".
- **The why.** The whole post is the why. It includes how the team worked ("We locked ourselves in a conference room for three months") and the rules it kept, written as imperatives: "Close laptops", "Make decisions quickly knowing you might change your mind."
- **Ending.** Credits the teams around the API (docs, CLI, Dashboard), then: "These are still early days. Come join us."
- **Headings.** Dated chapters: "Supporting card payments in the US (2011-2015)", "Seeking a simpler payments API (2015 - 2017)". A wry section title: "Keep it simple, Stripe".
- **What it leaves out.** Launch hype. It admits the new API "is also objectively a harder integration for users who only care about accepting card payments in the US and Canada."

### 4. Cloudflare: Details of the Cloudflare outage on July 2, 2019

<https://blog.cloudflare.com/details-of-the-cloudflare-outage-on-july-2-2019/>, John Graham-Cumming, July 12, 2019.

**Why it's celebrated.** 698 points and 149 comments on HN, many about the writing itself: "This is a fantastic postmortem." ([helper](https://news.ycombinator.com/item?id=20421865)); "Incredibly well written, thank you." ([hellogoodbye](https://news.ycombinator.com/item?id=20423011)); "There really should a prize or something for best postmortems" ([Havoc](https://news.ycombinator.com/item?id=20422784)).

- **Opening.** A personal story from 2010, when the author was a customer whose site went down, quoting the emails, then: "today, as an employee of a much, much larger Cloudflare I get to be the one who writes, transparently about a mistake we made".
- **Length.** About 3,200 words, plus a 1,500-word appendix on regex backtracking for those who want it.
- **Sentences and rhythm.** Plain declaratives in time order; the apology is three short sentences: "We know how much this hurt our customers. We're ashamed it happened."
- **Person and voice.** "I" and "we", unhedged, including the author's own part: "In the longer term we are moving away from the Lua WAF that I wrote years ago."
- **Showing the change.** A minute-by-minute timeline ("At 13:42 an engineer working on the firewall team deployed a minor change"), the actual regex, CPU graphs, the Jira ticket, and numbers: "In the last 60 days, 476 change requests have been handled".
- **The why.** It refuses the easy story: "Getting to a single root cause, while satisfying, may obscure the reality." Then lists eleven causes, including "We didn't update our status page quickly enough."
- **What's next.** Each fix marked with its state: "(Done)", "(Inspection complete)", "(ETA: July 19)".
- **Ending.** "We are ashamed of the outage, and sorry for the impact on our customers." Then the appendix, which walks "x=x" step by step: "Remember, this is all to match a three character string."
- **Headings.** Plain and functional: "What happened", "How Cloudflare operates", "What went wrong", "What's happened since last Tuesday", "Conclusion".
- **What it leaves out.** Blame on one engineer, and euphemism ("service degradation" never appears).

### 5. The Browser Company: Letter to Arc members 2025

<https://browsercompany.substack.com/p/letter-to-arc-members-2025>, Josh Miller, May 26, 2025.

**Why it's celebrated.** On HN: "a very well written piece of honest, unfiltered, uncomfortable communication to customers." ([kaushalvivek](https://news.ycombinator.com/item?id=44113358)). The commenter sets aside "the controversy of the decision", so the praise is for the writing.

- **Opening.** Names what the reader is thinking: "You're probably wondering what happened. One day we were all-in on Arc." Then a list of the questions the letter answers.
- **Length.** About 2,900 words.
- **Sentences and rhythm.** The shortest sentences of the ten (a rough script count gives about 13 words on average), with deliberate fragments: "Dia's architecture is fast. Really fast. Arc was bloated."
- **Person and voice.** "I" from the founder, signed "– Josh", with his email address in the body: "I'm josh@thebrowser.company."
- **Mistakes first.** The first section is "What we got wrong": "First, I would've stopped working on Arc a year earlier." And: "We knew. We were just in denial."
- **Showing the change.** Usage numbers that people could not have known: "Only 5.52% of DAUs use more than one Space regularly." Compared with Dia's "40% and 37% of DAUs".
- **The why.** One borrowed image does it: "Scott Forstall told us Arc felt like a saxophone — powerful but hard to learn. Then he challenged us: make it a piano."
- **Saying no.** It answers the hard request directly and gives the reason: "we can't do that meaningfully without also open-sourcing ADK."
- **Ending.** Admits the bet can fail ("To be clear, we might fail. Or we might partially succeed but not win."), then a P.S. with the one concrete next step for readers.
- **Headings.** The readers' own questions: "Why we didn't integrate Dia into Arc", "Will we open source Arc".
- **What it leaves out.** Little; some lines lean on aphorism ("We're getting out of the candle business. You should too."). It's the most rhetorical of the ten, and those lines are where it reads least like the rest.

## Changelogs

### 6. Linear changelog

<https://linear.app/changelog>, read for September 3 to November 12, 2026. Its rules are in Karri Saarinen's [Startups, Write Changelogs](https://linear.app/now/startups-write-changelogs) (May 18, 2020).

**Why it's celebrated.** fmerian's [Release notes are conversion tools too](https://dev.to/fmerian/release-notes-are-conversion-tools-too-297o) (June 7, 2023) leads with Linear and Saarinen's post. On HN: "One good example is Linear. The product improves day by day" ([wereHamster](https://news.ycombinator.com/item?id=30665773)); "Loved the method and their changelog" ([avinashjn](https://news.ycombinator.com/item?id=26913580)).

- **How entries are grouped.** One dated release about every week or two. Each has one to four headline features, each under its own H2, then "Fixes", "Improvements" and sometimes "API", "MCP server" or "Keyboard shortcuts" lists. Saarinen: "Feature 1–3 larger changes, and collect all the little fixes in one section."
- **Titles.** The feature's name: "Priority inbox", "Stacked pull requests", "Bring your own key (BYOK)".
- **One headline entry.** An image with literal alt text, then 50 to 150 words in two to four short paragraphs, then a pointer to docs. "Priority inbox" is 95 words.
- **Opening.** Either "you can now" or the problem first. "You can now bring your own key to Linear's cloud coding agent and use your existing provider credits and negotiated rates." Or: "An active workspace can create a significant amount of notifications each day, and until now your inbox treated them all the same."
- **The why.** One clause, attached to a concrete case: "so something like a review blocking a release never gets buried."
- **Limits and who.** Stated as plain facts: "You'll need an API key, not a ChatGPT or Claude subscription." "Available to Enterprise workspaces with Okta SAML configured."
- **What stays the same.** "You can also continue using the inbox just as you do today."
- **Showing.** An image or video per headline. The alt text is itself specific: "AI credit usage over seven days, showing 573 sessions, an average cost of $0.27 per session, and $153.34 in total spend."
- **Fix lines.** An area tag, then what now works, with the exact case: "Fixed pull requests from branches that put a prefix and underscore before the issue ID, such as amy_ENG-123_fix, linking to the issue again".
- **Ending.** "Learn more in our documentation." or "To get started, open the inbox display options or read the docs."
- **What it leaves out.** Internals. Saarinen: "Writing about database migrations is not that interesting unless it results in some performance gains or improves the user experience." Who writes it: "Usually it's the person who built the feature also writes the changelog."

### 7. Raycast changelog

<https://www.raycast.com/changelog>, read for v2.8 (October 16, 2026) to v2.12 (November 12, 2026).

**Why it's celebrated.** fmerian: "product-oriented, including three categories (new, improvements, fixes) and one bullet point per item. It's simple and straight to the point."

- **How entries are grouped.** One entry per version with its date, a cover image, a short intro paragraph, then "✨ New", "💎 Improvements", "🐞 Fixes". A big feature can get its own H2 ("🧮 AI Usage").
- **Intro paragraph.** Names the one thing this release is about, with numbers: "A brand new Calculator. We rebuilt the calculator from scratch. It's 60x faster and uses 65% less memory". Or: "This update is about speed. File Search returns results up to 6× faster and handles typos much better".
- **Bullets.** "Area: what changed", often with a real input as the example: "Calculator (Flights): Track a flight by its number, like flight BA117". Fixes name the symptom: "Clipboard History: Fixed small images pasting as TIFF instead of PNG".
- **Voice.** "We", casual, sometimes asides: "And while we're here, we've also decided to lift the 5 note limit on the free plan."
- **Weak spots, for contrast.** When the intro has nothing specific it goes generic: "This update brings new commands, useful improvements, and plenty of fixes across Raycast." Some bullets are vague ("Updated design when dragging files into a chat").
- **What it leaves out.** Why, for most bullets. That works for small items; it's a list, not an article.

### 8. Ghostty 1.3.0 release notes

<https://ghostty.org/docs/install/release-notes/1-3-0>, March 9, 2026.

**Why it's celebrated.** On Lobsters: "I really appreciate the human-written changelog. It was a pleasure to read!" ([jperras](https://lobste.rs/c/stzcd0)); "From the pre-release blogposts to the release notes, the communication from the this project is a great example" ([zetashift](https://lobste.rs/c/mecn9y)).

- **Opening.** What's in it, then the scale and the thanks: "This release features 6 months of work with changes from 180 contributors over 2,858 commits." Then: "These release notes are painstakingly and lovingly hand-crafted by human Ghostty maintainers, including the full changelog."
- **Grouping.** Security first, then Highlights (one H3 per feature with its PR numbers), System Requirements, Breaking Changes, Full Changelog by area (Terminal Capabilities, Shell Integration, macOS, GTK, Localization, Package Maintainers), then a libghostty update, a Financial Update and a Roadmap.
- **One highlight.** What you can do, the exact keys, how it behaves on each platform, then how it's built: "Search is implemented using a dedicated search thread that operates concurrently with terminal I/O."
- **Showing.** Screenshots and videos per feature, config you can paste (`notify-on-command-finish = unfocused`), before and after rows for text rendering, and numbers: "lowering the time the renderer holds the terminal lock by 2x to 5x."
- **The why of design choices.** "we use a minimal overlay-style scrollbar so that the terminal grid doesn't have to reserve space for the scrollbar".
- **Limits.** "We're treating this as a preview feature in 1.3." "A GTK implementation of this feature is planned for a future release." "support for Microsoft Windows is still not planned."
- **Candour.** On fuzzing finds: "None of these were known to cause any real-world issues, but they may have!"
- **Full changelog line.** A sentence on what you can now do, then the issue: "Native scrollbars are now available to navigate scrollback. These can be controlled with the new scrollbar configuration. #111"
- **Ending.** The roadmap, without promises: "I don't want to promise any specific features, but we're working hard on making Ghostty scriptable".

### 9. esbuild CHANGELOG.md

<https://github.com/evanw/esbuild/blob/main/CHANGELOG.md>, read from 0.27.3 to Unreleased (2026).

**Why it's celebrated.** "ESbuild has really good documentation and a great CHANGELOG. It is always a pleasure to read a new entry in its CHANGELOG." The same comment faults a rival whose changelog "is too close to the code." ([conaclos](https://news.ycombinator.com/item?id=35048190)).

- **Grouping and titles.** One `##` per version, no dates in the file. Each entry is a bullet whose first line is the change, with its issue link: "Fix CSS minification bug involving `&`", "Stop publishing to https://deno.land/x/esbuild", "Avoid overwriting input files without `--allow-overwrite`".
- **One entry.** Indented paragraphs: what was wrong or what changed outside, what esbuild does now, and a before and after: `/* Old output (with --minify) */` then `/* New output (with --minify) */`.
- **The why.** Always the outside cause first: "Deno has made the https://deno.land/x package registry read-only, so new versions of esbuild can no longer be published".
- **Voice.** First person, candid: "it accidentally regressed in version 0.17.0 and apparently didn't have any test coverage." Then one word: "Oops."
- **Credit.** "This fix was submitted by @ZuBB."
- **Length.** 30 to 300 words an entry, as long as the case needs.
- **What it leaves out.** Images and marketing. The code is the screenshot.

### 10. CodeKit updates

<https://codekitapp.com/updates/>, read for 3.35 (January 22, 2026) to 3.38 (October 20, 2026).

**Why it's celebrated.** "Codekit still has the best release notes" ([plasticsoprano](https://news.ycombinator.com/item?id=43013096)); "His documentation, sales copy and release notes are always hilarious." ([mthoms](https://news.ycombinator.com/item?id=21964040)).

- **Grouping.** "Version 3.38", the date, the build and a download link, then H4 groups named by topic, each a short bullet list, and always "Component Updates:" with version numbers.
- **Titles with voice.** "The X.X.2 of Shame", "Taken Out Back And Shot:", "NEW TypeScript 7".
- **Bullets.** Short and literal: "The .2 fixes a crash introduced by macOS Golden Gate." Removals with a reason in five words: "Bower. Use npm instead." "Bless. Internet Explorer has, mercifully, stayed dead."
- **The why of what's missing.** "This CodeKit release does not include Babel 8." It says why: community tooling hasn't caught up.
- **Advice.** It tells you what to do: "If you're still on an Intel Mac, get to Apple Silicon."
- **Jokes inside the fix list.** "I've been programming since 1998 and I picked last year to finally learn Vim. Just in time to not type code anymore."
- **Weak spots.** "MANY bugs fixed." And one 3.35 fix line is a jab at a group of people, which shows where a strong voice misfires.
- **Length.** 140 to 520 words per version.

### Also read: Amp's Chronicle, "Bye Bye, Dial"

<https://ampcode.com/news/bye-bye-dial>, November 12, 2026. Not counted (no practitioner praise found), but Basecase's brief names Amp as its model, so it's worth seeing what one entry does. About 710 words.

- Opens on the change in one line: "Today we're saying goodbye to the Dial and its four modes: low, medium, high, and ultra."
- Admits the reversal under its own heading, "Yes, We Changed Our Mind": "In January we explained why Amp does not have a model selector."
- Gives the cost: "A model switch still has a price. Prompt caches belong to one model, so the new model reads the whole thread uncached".
- Ends on what happens to the reader's setup ("What Happens to Your Dial": "Until today everyone used the Dial, so this applies to you.") and the old modes' models, one per line.

## What the best ones share

1. **They start from the reader's situation, not the feature's name.** Linear opens "Priority inbox" with the notification flood; Arc with "You're probably wondering what happened"; Tailscale with "a simple problem"; Cloudflare with its author as a customer whose site went down. Even the one-line openings lead with the person ("You can now…", Linear) or the outcome ("It's 60x faster", Raycast).

2. **The why is one concrete case, placed next to the what.** Not a mission statement: a case. Linear's "a review blocking a release never gets buried"; Figma's AB/BC/ABC; Stripe's iDEAL customer whose browser drops after paying; esbuild's "Deno has made… read-only". Every changelog with a strong why gives it in one clause.

3. **Numbers you could check.** Raycast's "60x faster and uses 65% less memory"; Ghostty's "180 contributors over 2,858 commits" and "2x to 5x"; Arc's "5.52% of DAUs"; Cloudflare's "476 change requests" and "p99 of 2.29s"; Stripe's "11 properties to 36 properties"; Tailscale's "under 2 seconds". Where a change can be measured, the headline gives the measure.

4. **They show the thing.** A real input, a real output or a real screen: Linear's image per headline with literal alt text; Ghostty's videos and config lines; esbuild's old and new output; Tailscale's addresses and diagrams; Cloudflare's actual regex and Jira ticket; Figma's animations. Where there's no screen, there's an example ("flight BA117").

5. **Limits, costs and reversals are said plainly, in their own sentence.** "You'll need an API key, not a ChatGPT or Claude subscription" (Linear). "We're treating this as a preview feature" (Ghostty). "objectively a harder integration" (Stripe). "This solution isn't great because the object temporarily disappears" (Figma). "Yes, We Changed Our Mind" (Amp). "We knew. We were just in denial." (Arc). Admitting the downside is what makes the upside believable.

6. **A person is writing.** First person, someone accountable: Graham-Cumming's "the Lua WAF that I wrote years ago", esbuild's "Oops.", Arc signed "– Josh" with an email address, Ghostty's "hand-crafted by human Ghostty maintainers", Linear's rule that the builder writes the entry. Voice comes from knowing the thing first-hand, not from adjectives.

7. **Short sentences turn the argument; long ones carry it.** Tailscale's "…Right?" / "Well, not quite."; Arc's "Really fast."; Cloudflare's "We're ashamed it happened."; CodeKit's "Bower. Use npm instead." The rhythm varies. None of the strong ones is a run of equally long sentences.

8. **Size and structure follow the content.** Changelogs split headliners from fixes (Linear, Raycast, Ghostty) and keep each fix to one line that names the symptom. Articles use headings that name what's under them, often in the reader's words (Arc's questions, Cloudflare's "What went wrong", Figma's "Syncing trees of objects"). Long articles give the reader a map and a recap (Figma's reading map, Tailscale's TL;DR).

9. **They end on something the reader can use.** A next step (Linear's docs link, Arc's P.S.), a checklist (Tailscale), takeaways (Figma), a status per fix (Cloudflare), a roadmap without promises (Ghostty). None ends on a slogan.

## What separates them from typical or AI-sounding product writing

- **Specific nouns where generic writing has adjectives.** Typical copy says "powerful", "seamless", "a whole new way". These say "flight BA117", "amy_ENG-123_fix", "23 steps to match x=x". When Raycast's intro slips to "useful improvements, and plenty of fixes" it's the weakest line on the page.
- **One claim per sentence.** AI-sounding text stacks three clauses joined by commas and "and", each a little vague. The models give a fact, then a reason, then a limit, each in its own sentence (Linear's BYOK entry is four short paragraphs of one idea each).
- **No even rhythm.** Generated prose tends to sentences of similar length and the same shape. The models break it on purpose: one-word answers, questions, fragments.
- **Admissions.** Typical launch copy never says what's worse, missing or reversed. Every one of the ten does at least once.
- **Stakes and a person.** Typical writing is anonymous and certain; these are signed, first-hand and willing to say "we might fail" (Arc) or "Oops" (esbuild).
- **No templated scaffolding.** No "In today's fast-paced world", no "Whether you're a… or a…", no closing "Try it today!" Headings name content, not marketing beats ("Unlock", "Supercharge").
- **Things the generic version can't know.** Internal numbers (Arc's usage percentages), history (Stripe's 2011 landing page), what broke along the way (Cloudflare's lost credentials), who helped ("Thanks to asciinema"). These are the details a model filling a template can't supply, and they're why the pieces read as true.

## Where Basecase falls short

Read on 2026-11-13: eight changelog entries in `site/content/changelog/` and one blog post, `site/content/blog/datasets-on-hugging-face.md`. Sentence counts below come from a rough script, not careful parsing.

**What's already right.** Titles name the feature ("Calibrate servos", "Export a robot package"). Entries use real menu paths and shortcuts. The blog post opens by defining a Case and naming the old pain ("getting them anywhere useful meant unpacking and uploading them yourself"), and gives one real why ("so publishing Touch the Dots from two different scenes makes two datasets instead of one replacing the other"). The Hugging Face entry has screenshots of each state. No marketing words anywhere.

1. **Seven of eight entries are two long sentences that inventory the UI.** Six of the seven short entries average 21 to 29 words a sentence; Raycast's intros average about 11 and Linear's BYOK entry about 14. A typical one opens "Calibrate Servos moves each joint of a connected emulated robot through a slow bench run and fits its servo", then adds in the same sentence the three places that use the fit. Mechanism, condition and three downstream places in one breath. The models (pattern 7) would split it and lead with what the person gets.

2. **The subject of the first sentence is a menu label, not a person or a problem.** "Calibrate Servos moves…", "Export ▸ Basecase Scene saves…", "Publish to Hugging Face, next to Export Dataset in Results and in ⌘K, sends…", "Import Robot now takes…". Linear starts with "You can now…" or the problem; Raycast with what it does for you. Where-it-lives belongs in the second sentence.

3. **No why, and no problem.** None of the short entries says what was hard before. Why calibrate a servo at all: what goes wrong in Simulate without it? Why would someone export a robot package: what did they have to do before? Compare Linear's "until now your inbox treated them all the same" and esbuild's outside cause.

4. **No numbers.** How long does a calibration take? How much closer is the sim after a fit? How big is a robot package, and which ROS versions read it? How many robots did Import Robot get right from GitHub? The models put a checkable figure in nearly every headline (pattern 3); Basecase has none outside version numbers.

5. **Almost no images.** Only the Hugging Face entry has any (three). The brief asks for screenshots "nearly always", and Linear puts one on every headline. "One Align strip" describes a strip of icons in words ("the same icon strips as the Inspector, one row per axis with Spread beside each") that one screenshot would show.

6. **Limits are buried in adjectives or the last line.** That calibration works only on an emulated robot is the word "emulated" mid-sentence in `2026-11-12-calibrate-servos.md`. "It works in the desktop app." is the final sentence of the Hugging Face entry, after the token section. Ghostty and Linear give the limit its own sentence, early (pattern 5).

7. **Entries that fail the project's own bar.** `2026-11-12-one-align-strip.md` is polish plus a rename ("the Distribute commands are now called Spread Along X, Y and Z"), which `telling.md` says never gets an entry. Four entries on 2026-11-12 are separate pages with nothing to group them; Linear would publish one dated release with one to three headliners and a fix list. `2026-11-01-share-scenes-as-files.md` crams two features (scene files and Import Mesh) into one 59-word entry.

8. **No person.** No "we", no "I", no one who built it. Nothing first-hand: what was hard, what changed course, what surprised the builder. Compare Amp's "Yes, We Changed Our Mind" and esbuild's "Oops." (pattern 6). The brief asks for "first-hand"; the entries don't do it yet.

9. **The long entry reads like a manual, not news.** The Hugging Face entry's sections ("Where it is", "Signing in", "What gets sent", "Publishing again", "Your token") are the help article's steps in prose; `site/content/help/publish-a-dataset-to-hugging-face.md` already covers them. What's missing is what news adds: who wanted this, what it unlocks (the dataset loads in LeRobot without unzipping), what it doesn't do yet. Amp's 710-word entry spends its headings on the change of mind, the cost and what happens to your setup.

10. **The blog post duplicates the changelog.** `datasets-on-hugging-face.md` (283 words) repeats the changelog entry nearly line for line; the token paragraph is the same sentence in both: "The token stays in the app's main process, encrypted on disk." The ten blog posts here are 2,900 to 8,800 words with a story, a decision, its alternatives, numbers and an admitted cost. A Basecase post worth writing would be the story of the choice behind a feature: why tag the repo v2.1, why one repo per scene, why the token never reaches the page, what broke on the way. The brief's 100 to 300 words leaves no room for that.

11. **Endings are preconditions.** "…once the scene has a movable joint." "It works in the desktop app." The models end on a next step, a pointer to docs (Linear) or what comes next (Ghostty's roadmap). Basecase has help articles for most of these features (`site/content/help/calibrate-an-emulated-robot.md`, `export-a-robot-package.md`, `import-a-robot.md`, `align-and-spread-parts.md`, `share-a-scene.md`), but no entry links to its article.

## Sources

Pieces:

- Tailscale, [How NAT traversal works](https://tailscale.com/blog/how-nat-traversal-works)
- Figma, [How Figma's multiplayer technology works](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/)
- Stripe, [Stripe's payments APIs: the first ten years](https://stripe.com/blog/payment-api-design)
- Cloudflare, [Details of the Cloudflare outage on July 2, 2019](https://blog.cloudflare.com/details-of-the-cloudflare-outage-on-july-2-2019/)
- The Browser Company, [Letter to Arc members 2025](https://browsercompany.substack.com/p/letter-to-arc-members-2025)
- Linear, [Changelog](https://linear.app/changelog) and Karri Saarinen, [Startups, Write Changelogs](https://linear.app/now/startups-write-changelogs)
- Raycast, [Changelog](https://www.raycast.com/changelog)
- Ghostty, [1.3.0 release notes](https://ghostty.org/docs/install/release-notes/1-3-0)
- esbuild, [CHANGELOG.md](https://github.com/evanw/esbuild/blob/main/CHANGELOG.md)
- CodeKit, [Updates](https://codekitapp.com/updates/)
- Amp, [Bye Bye, Dial](https://ampcode.com/news/bye-bye-dial) (not counted)

Discussions:

- Hacker News threads: Tailscale [30707711](https://news.ycombinator.com/item?id=30707711), [42600846](https://news.ycombinator.com/item?id=42600846); Figma [21378858](https://news.ycombinator.com/item?id=21378858); Stripe [25433439](https://news.ycombinator.com/item?id=25433439), [25455638](https://news.ycombinator.com/item?id=25455638); Cloudflare [20421538](https://news.ycombinator.com/item?id=20421538); Arc [44102709](https://news.ycombinator.com/item?id=44102709)
- Lobsters, [Ghostty 1.3.0](https://lobste.rs/s/flbwoi)
- fmerian, [Release notes are conversion tools too](https://dev.to/fmerian/release-notes-are-conversion-tools-too-297o)
