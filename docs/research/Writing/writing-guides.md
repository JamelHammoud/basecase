# Writing guides for the blog, changelog and help center

Research for rewriting Basecase's long-form copy: the changelog (`site/content/changelog/`), launch blog posts (`site/content/blog/`) and the help center (`site/content/help/`). It picks five celebrated, non-AI writing guides, records what each one says in its own words, turns them into rules Basecase could adopt and test, and lists the gaps between those rules and what Basecase ships today.

**Method.** Every page cited below was fetched on 2026-11-13 and its text saved and searched, so each quote was checked word for word against the page. Quotes are at most 25 words; a shortened quote ends where the source sentence goes on. Anything not checked that way is marked _(unverified)_. The applies-to tags are:

- **C**: a changelog entry
- **B**: a launch blog post
- **H**: the help center (article types, titles, steps, screenshots, collections, search terms, troubleshooting, links between articles)

## The five guides

| #   | Guide                                                         | What it covers best                                                                             | Main URL                                                                    |
| --- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1   | GOV.UK content and publishing guidance (GDS)                  | Plain prose, titles, summaries, links, steps, change notes, no FAQs                             | https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/     |
| 2   | Nielsen Norman Group research on reading online               | How people scan (F-pattern), inverted pyramid, objective vs promotional text, help and docs     | https://www.nngroup.com/articles/how-users-read-on-the-web/                 |
| 3   | Diátaxis (Daniele Procida)                                    | Help and documentation structure: tutorials, how-to guides, reference, explanation              | https://diataxis.fr/                                                        |
| 4   | Mailchimp Content Style Guide                                 | Voice and tone, educational (help center) content, screenshots, related links                   | https://styleguide.mailchimp.com/                                           |
| 5   | Microsoft Writing Style Guide                                 | Product and UI copy, step-by-step instructions, UI labels in instructions, headings, scanning   | https://learn.microsoft.com/en-us/style-guide/welcome/                      |

Together they cover the five areas asked for: plain human prose (GOV.UK, Microsoft), writing for the web and scanning (NN/g, GOV.UK, Microsoft), help structure (Diátaxis, NN/g, Mailchimp), voice and tone (Mailchimp, Microsoft, GOV.UK) and product UI copy (Microsoft, Mailchimp).

**Why not the other candidates.**

- Orwell's "Politics and the English Language" and Strunk & White's _The Elements of Style_ are about prose alone. They say nothing about scanning, help structure or UI labels, and GOV.UK and Microsoft give the same plain-prose advice in testable form (word limits, banned words). Not fetched.
- The Google developer documentation style guide overlaps Microsoft's, and Google's own guide sends readers to Microsoft for technical style (quoted under Microsoft below). Only its front page was fetched.
- The Apple Style Guide and plainlanguage.gov were not fetched, so nothing here relies on them.
- Paul Graham's "Writing, Briefly" is a personal essay rather than a guide people adopt as a standard. Not fetched.

---

## 1. GOV.UK content and publishing guidance

**URLs.** The old `gov.uk/guidance/content-design` and `gov.uk/guidance/style-guide` manuals now redirect (301) to one site, https://guidance.publishing.service.gov.uk/. Pages read:

- Writing guidelines: [meet user needs](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/meet-user-needs/), [clear structure](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-structure/), [clear language](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-language/), [right tone](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/right-tone/), [links](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/add-links/), [titles](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-titles/), [summaries](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/summaries/), [change notes](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/change-notes/)
- [A to Z style guide](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/style-guides/a-to-z-style-guide/)

**Why it's authoritative.**

- It's the binding standard for UK government publishing, written by the Government Digital Service: "Plain English is mandatory for all of GOV.UK." The June 2026 launch post for the merged site says "Around 3,000 people across government publish content on GOV.UK" ([Inside GOV.UK blog](https://insidegovuk.blog.gov.uk/2026/06/08/launching-gov-uks-new-content-and-publishing-guidance/)).
- Its approach spread abroad. A 2014 GDS post on Norway's government sites reports "Ove explained that their approach to changing the content design of the website was based on GOV.UK’s user needs approach" ([GDS blog](https://gds.blog.gov.uk/2014/06/19/improving-the-norwegian-user-experience/)).
- A search result says the US 18F Content Guide was adapted from GOV.UK's work. _(Unverified: guides.18f.gov didn't resolve when fetched.)_

**Key rules.**

| Rule                                    | Exact words                                                                                                                                                           | Applies to |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Write only what the need requires       | "Publish only what’s needed to meet that user need and nothing more."                                                                                                 | C B H      |
| People skim                             | most people "only read 20 to 28% of text on a webpage, and can skim even more out of impatience"                                                                      | C B H      |
| Frontload                               | "Put the most important information first."                                                                                                                           | C B H      |
| Plain English for experts too           | "Research shows that people with higher levels of literacy prefer plain English because it allows them to understand the information as quickly as possible."        | C B H      |
| Short words                             | "Do not use formal or long words when easy or short ones will do."                                                                                                    | C B H      |
| Define specialist terms once            | "You just need to explain what they mean the first time you use them."                                                                                                | B H        |
| Use the reader's words                  | "You might want to look at common search terms to find what words are more commonly used."                                                                            | H          |
| Negative contractions                   | "Use contractions like ‘you’ll’, but avoid negative contractions like ‘can’t’ or ‘don’t’."                                                                            | C B H      |
| Requirements                            | "If you’re talking about a legal requirement, use ‘must’." Optional things: "If something is optional, you can use ‘can’."                                            | H          |
| Active voice                            | "Use the active voice rather than the passive voice."                                                                                                                 | C B H      |
| Length limits                           | "Paragraphs should have no more than 5 sentences each." "Try to split up sentences that are over 25 words long."                                                      | C B H      |
| Headings                                | Write headings that are "descriptive – avoid generic headings like ‘Introduction’", "frontloaded", "active", and "removable – the content should still make sense with the headings removed" | B H        |
| No question headings                    | Headings should not "be questions – they’re hard to frontload and users want answers, not questions"                                                                  | B H        |
| Don't repeat the summary                | "Do not repeat the summary in the first paragraph."                                                                                                                   | H          |
| Tone                                    | "brisk, but not terse"; "emotionless – adjectives can be subjective and make the text sound more emotive and like spin"                                               | C B H      |
| No "please"                             | "There’s usually no need to say ‘please’ or ‘please note’."                                                                                                           | C B H      |
| Who "we" is                             | "Do not assume the audience will know who the ‘we’ is."                                                                                                               | B          |
| Titles start from search                | "Most people who use GOV.UK start with a search engine. Use the same language as your audience so they can find your content."                                       | B H        |
| Title length and uniqueness             | "Your title should be 65 characters or less (including spaces)." "Titles must be unique and informative so that users know which page they are on."                  | C B H      |
| Titles stand alone                      | A title should make sense "by itself", "in search results" and "in document collections"                                                                             | H          |
| Title verb                              | "Use the active verb (‘Submit’) if you use the page to do something."                                                                                                 | H          |
| No content type in titles               | "Do not include the name of the content type, such as ‘guidance’ or ‘consultation’."                                                                                  | H          |
| Summary length                          | "Keep all summaries to 160 characters, including spaces."                                                                                                             | H          |
| Summary punctuation                     | "Summaries should end with a full stop."                                                                                                                              | H          |
| Summary adds words                      | "Use as few words from the title as possible, and include keywords that you’ve not used in the title."                                                                | H          |
| Links in context                        | "Make sure all links are provided in context, at the point in the content at which they’re useful."                                                                   | C B H      |
| No link dumps                           | Do not "use unsorted lists like ‘Further reading’ or ‘More information’ to link off to content the user might be interested in"                                       | B H        |
| Link text                               | "make it descriptive and avoid generic text like ‘click here’ or ‘more’"; "do not reuse the same link text to link to different pages"                                | C B H      |
| Task links start with a verb            | "If your link takes the user to a page where they can start a task, start your link with a verb."                                                                     | C B H      |
| Steps                                   | "Use numbered steps instead of bullet points to guide a user through a process." "Steps end in a full stop because each should be a complete sentence."               | H          |
| Bold for UI in instructions only        | "Only use bold to indicate interface elements in text that are explicitly telling the user what to do"                                                               | H          |
| "Select", not "click"                   | "Don’t use “click” when talking about user interfaces because not all users click. Use “select”."                                                                     | H          |
| No FAQs                                 | "Do not use FAQs on GOV.UK. If you write content by starting with user needs, you will not need to use FAQs."                                                         | H          |
| When to write a change note             | Write one if you've "added new information that means a user has to do something differently or know something new"                                                 | C          |
| Say what changed                        | "Do not say the page has been updated without saying what has changed."                                                                                               | C          |
| Most important change first             | Change notes should "include the most important information about what has changed first"                                                                             | C          |
| Put the change in the note              | "Include the changed information in the change note itself if possible"                                                                                               | C          |

GOV.UK's bad change-note examples are worth keeping beside the changelog: "‘Guidance updated.’" and "‘Removed broken link.’". It also says no note is needed if you've only "fixed typos" or "made style changes, like changing a heading or layout", which matches Basecase's existing bar of no entries for fixes and polish.

---

## 2. Nielsen Norman Group: how people read online

**URLs.**

- [How Users Read on the Web](https://www.nngroup.com/articles/how-users-read-on-the-web/), Jakob Nielsen, 1997
- [Concise, SCANNABLE, and Objective: How to Write for the Web](https://www.nngroup.com/articles/concise-scannable-and-objective-how-to-write-for-the-web/), John Morkes and Jakob Nielsen, 1997
- [F-Shaped Pattern of Reading on the Web](https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content/), Kara Pernice, 2017, last reviewed August 2026
- [Inverted Pyramid: Writing for Comprehension](https://www.nngroup.com/articles/inverted-pyramid/), Amy Schade, 2018
- [Help and Documentation (Usability Heuristic #10)](https://www.nngroup.com/articles/help-and-documentation/), Alita Kendrick, 2020

**Why it's authoritative.**

- NN/g's [About page](https://www.nngroup.com/about/): "The company was established in 1998 by two UX pioneers, Dr. Jakob Nielsen and Dr. Don Norman." The same page credits Nielsen with the Ten Usability Heuristics.
- Its findings run through the other guides. GOV.UK's structure page repeats the 20 to 28% figure and the F-shape without naming a source, and Microsoft's Scannable content page says "people read in an F shape".
- The rules rest on measured studies, not taste. In the 1997 study, rewriting one site's text raised measured usability by 58% when concise, 47% when scannable, 27% when objective and 124% with all three.

**Key rules.**

| Rule                                   | Exact words                                                                                                                                         | Applies to |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| People scan                            | "People rarely read Web pages word by word; instead, they scan the page, picking out individual words and sentences."                              | C B H      |
| The data                               | "79 percent of our test users always scanned any new page they came across; only 16 percent read word-by-word."                                    | C B H      |
| How to make text scannable             | "meaningful sub-headings (not "clever" ones)"; "one idea per paragraph"; "the inverted pyramid style, starting with the conclusion"                 | C B H      |
| Cut the length                         | "half the word count (or less) than conventional writing"                                                                                           | C B H      |
| No marketese                           | "Users detested "marketese"; the promotional writing style with boastful subjective claims ("hottest ever")"                                       | C B        |
| Experts read the same way              | "there appeared to be no major differences in how technical and non-technical users approached reading on the Web."                                 | C B H      |
| Experts want the same things           | "Both groups desired scannable text, short text, summaries, etc."                                                                                   | C B H      |
| First two paragraphs                   | "Include the most important points in the first two paragraphs on the page."                                                                        | C B H      |
| First two words                        | "Start headings and subheadings with the words carrying most information"; a reader seeing "only the first 2 words" should "still get the gist"     | B H        |
| Assume scanning                        | "Assume that most users will be scanning."                                                                                                          | C B H      |
| Inverted pyramid                       | "Start content with the most important piece of information so readers can get the main point, regardless of how much they read."                  | C B        |
| Sentence openings                      | "The first words in each sentence should be information-carrying and indicate what content will follow."                                            | C B H      |
| Heuristic #10                          | "Any such information should be easy to search, focused on the user’s task, list concrete steps to be carried out, and not be too large."          | H          |
| Reactive help goes deep                | "Ensure reactive-help documentation is comprehensive and detailed. Don’t include only obvious information."                                         | H          |
| Scannable help                         | "Support scanning by using the rules of writing for the web."                                                                                       | H          |
| Pictures are secondary                 | "Consider using graphics and videos as a secondary information source." "Still offer text-based help, as people aren’t always able to (or want to) watch videos." | H          |
| Search                                 | "Optimize for search."                                                                                                                              | H          |
| Collections                            | "Group help topics into relevant categories."                                                                                                       | H          |
| Top articles                           | "Highlight top content that is frequently viewed."                                                                                                  | H          |
| Help in context                        | "Favor pull over push revelations." "Proactive help content should be accessible elsewhere."                                                        | H          |

The help heuristic also names the two moments help is read in: "Reactive help is provided in response to the user encountering a problem", and its goal includes "troubleshoot user problems". That is the job of troubleshooting articles.

---

## 3. Diátaxis

**URLs.** [Home](https://diataxis.fr/), [Tutorials](https://diataxis.fr/tutorials/), [How-to guides](https://diataxis.fr/how-to-guides/), [Reference](https://diataxis.fr/reference/), [Explanation](https://diataxis.fr/explanation/), [The map](https://diataxis.fr/map/).

**Why it's authoritative.**

- The home page says "Its principles have been adopted successfully in hundreds of documentation projects." That is the project's own claim.
- It quotes named teams. Cloudflare: "While redesigning the Cloudflare developer docs, Diátaxis became our north star for information architecture." Gatsby: "At Gatsby we recently reorganized our open-source documentation, and the Diátaxis framework was our go-to resource". Vonage is quoted too.
- Its core idea: "Diátaxis identifies four distinct needs, and four corresponding forms of documentation - tutorials, how-to guides, technical reference and explanation."

**The four types** (from the map). Each answers a different question:

| Type          | Answers                  | Oriented to   | Form                  |
| ------------- | ------------------------ | ------------- | --------------------- |
| Tutorial      | "Can you teach me to…?"  | learning      | a lesson              |
| How-to guide  | "How do I…?"             | goals         | a series of steps     |
| Reference     | "What is…?"              | information   | dry description       |
| Explanation   | "Why…?"                  | understanding | discursive explanation |

**Key rules.**

| Rule                                    | Exact words                                                                                                                         | Applies to |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Don't organise by feature               | "documentation creators will often try to structure their work around features of a product. This is rarely successful"           | H          |
| Don't blur the types                    | "In the worst case there is a complete or partial collapse of tutorials and how-to guides into each other"                         | H          |
| Readers arrive anywhere                 | "an actual user may enter the documentation anywhere in search of guidance on some particular subject"                             | H          |
| How-to: the user's goal                 | "How-to guides must be written from the perspective of the user, not of the machinery."                                            | H          |
| How-to: goals, not tools                | "How-to guides are about goals, projects and problems, not about tools."                                                           | H          |
| How-to: action only                     | "action and only action"; "no digression, explanation, teaching"                                                                   | H          |
| How-to: link instead of explain         | "They get in the way of the action; if they’re important, link to them."                                                           | H          |
| How-to: not exhaustive                  | "practical usability is more helpful than completeness."                                                                            | H          |
| How-to: a competent reader              | "assume the user knows what they want to achieve"                                                                                   | H          |
| How-to: branches                        | "If you want x, do y. To achieve w, do z." "Use conditional imperatives."                                                          | H          |
| How-to: titles                          | "Choose titles that say exactly what a how-to guide shows." Very bad: "Application performance monitoring", which might be about "whether" | H          |
| How-to: they sell the product           | "A rich list of how-to guides is an encouraging suggestion of a product’s capabilities."                                            | H          |
| How-to: most read                       | "Well-written how-to guides that address the right questions are likely to be the most-read sections of your documentation."       | H          |
| Tutorial: show the goal first           | "It’s important to allow the learner to form an idea of what they will achieve right from the start."                             | H          |
| Tutorial: visible results               | "Every step the learner follows should produce a comprehensible result, however small."                                            | H          |
| Tutorial: say what to expect            | "Show the user actual example output, or even the exact expected output."                                                          | H          |
| Tutorial: no explanation                | "A tutorial is not the place for explanation."                                                                                      | H          |
| Tutorial: must always work              | "your tutorial works for every user, every time."                                                                                   | H          |
| Tutorial: phrasing                      | "In this tutorial you will learn… - which is presumptuous and a very poor pattern."                                                | H          |
| Reference: describe only                | "Neutral description is the key imperative of technical reference."                                                                 | C H        |
| Reference: consistent                   | "Reference material is useful when it is consistent."                                                                               | C H        |
| Reference: mirror the product           | "the structure of the documentation should mirror the structure of the product"                                                    | H          |
| Explanation: the why                    | "explain why things are so - design decisions, historical reasons, technical constraints."                                          | B H        |
| Explanation: titles                     | "you should be able to place an implicit (or even explicit) about in front of each title"                                          | B H        |
| Explanation: stay bounded               | "One risk of explanation is that it tends to absorb other things."                                                                  | B H        |

Diátaxis has no changelog or blog type. Two readings follow from its definitions; they are this document's inference, not Diátaxis's words. A changelog entry is closest to reference: neutral description of what changed. A launch blog post is closest to explanation: the why, the design decisions and the constraints, with steps left to the help article.

---

## 4. Mailchimp Content Style Guide

**URLs.** [Home](https://styleguide.mailchimp.com/), [Writing Goals and Principles](https://styleguide.mailchimp.com/writing-principles/), [Voice and Tone](https://styleguide.mailchimp.com/voice-and-tone/), [How to Write Educational Content](https://styleguide.mailchimp.com/writing-educational-content/), [Web Elements](https://styleguide.mailchimp.com/web-elements/), [TL;DR](https://styleguide.mailchimp.com/tldr/).

**Why it's authoritative.**

- It's public and meant to be reused: "This style guide was created for Mailchimp employees, but we hope it’s helpful for other content and communications teams too." It's under a Creative Commons licence, with the source on GitHub.
- Roundups of style guides treat it as the model. [UX Writing Hub](https://uxwritinghub.com/content-style-guides/) calls Mailchimp and Google a "golden standard for writing style guides" and reports that Buffer's guide follows Mailchimp's. _(The Buffer claim is second-hand; Buffer's guide wasn't fetched.)_ [Working in Content](https://workingincontent.com/resources/content-style-guides) lists it among its style-guide resources.
- Basecase's own `docs/guide/copy.md` already cites its Voice and Tone page.

**Key rules.**

| Rule                                     | Exact words                                                                                                                                       | Applies to |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Tell the truth                           | "Avoid dramatic storytelling and grandiose claims. Focus on our real strengths."                                                                  | C B        |
| Don't market                             | "Don’t market at people; communicate with them."                                                                                                  | C B        |
| What readers need                        | "Tell readers what they need to know, not just what we want to say."                                                                              | C B H      |
| The curse of knowledge                   | "Remember that you’re the expert, and readers don’t have access to everything you know."                                                         | B H        |
| Voice vs tone                            | "You have the same voice all the time, but your tone changes."                                                                                    | C B H      |
| Clear over clever                        | "it’s always more important to be clear than entertaining."                                                                                      | C B H      |
| Read the room                            | "consider the reader’s state of mind."                                                                                                            | C B H      |
| Humor                                    | "forced humor can be worse than none at all. If you’re unsure, keep a straight face."                                                            | C B H      |
| No fluff                                 | "we avoid distractions like fluffy metaphors and cheap plays to emotion."                                                                         | C B        |
| Lead with the point                      | "Lead with the main point or the most important content."                                                                                         | C B H      |
| Both kinds of reader                     | "Some people will read every word you write. Others will just scan."                                                                              | C B H      |
| Help-center scope                        | Educational content includes "Help Center articles, guides, tutorials and troubleshooting advice" and "Release notes"                             | C H        |
| Answer, then stop                        | "our goal is to provide answers without distraction."                                                                                             | H          |
| The reader's mindset                     | "What is this person’s mindset? Are they in the middle of a task, or in a hurry?"                                                                | H          |
| Stay on topic                            | "Don’t stray too far from the title or topic at hand. Use links to make related content available."                                              | H          |
| Headlines                                | "be sure your headlines are short, descriptive, and parallel to help with scanning."                                                              | B H        |
| Sentence length                          | "Aim to keep your sentences at 25 words or less."                                                                                                 | C B H      |
| Screenshots                              | "Keep each visual focused on the action or meaning it conveys. Always crop screenshots tightly around the action."                               | C B H      |
| UI labels in steps                       | "In step-by-step instructions, capitalize and bold navigation and button labels as they appear in the app."                                      | H          |
| Numbered lists                           | "Number lists when the order is important, like when you’re describing steps of a process."                                                      | H          |
| Link text                                | "Don’t say things like “Click here!” or “Click for more information” or “Read this.”"                                                            | C B H      |
| Related articles: few                    | "Don’t go overboard—4 is usually plenty."                                                                                                          | H          |
| Related articles: order                  | "The first article should be a step down in complexity from the current article." The second is "a step up in complexity"                         | H          |
| One topic per page                       | "Organize your page around one topic."                                                                                                            | B H        |
| SEO                                      | "We write for humans, not machines."                                                                                                              | B H        |

Mailchimp contradicts itself on button casing: Web Elements says buttons use "sentence case", while TL;DR says "Capitalize every word, including articles." It also sets page titles in title case ("Titles are written (you guessed it) in title case") but headings in sentence case.

---

## 5. Microsoft Writing Style Guide

**URLs.** [Welcome](https://learn.microsoft.com/en-us/style-guide/welcome/), [Top 10 tips](https://learn.microsoft.com/en-us/style-guide/top-10-tips-style-voice), [Brand voice](https://learn.microsoft.com/en-us/style-guide/brand-voice-above-all-simple-human), [Writing step-by-step instructions](https://learn.microsoft.com/en-us/style-guide/procedures-instructions/writing-step-by-step-instructions), [Formatting text in instructions](https://learn.microsoft.com/en-us/style-guide/procedures-instructions/formatting-text-in-instructions), [Describing interactions with the UI](https://learn.microsoft.com/en-us/style-guide/procedures-instructions/describing-interactions-with-ui), [Scannable content](https://learn.microsoft.com/en-us/style-guide/scannable-content/), [Headings](https://learn.microsoft.com/en-us/style-guide/scannable-content/headings).

**Why it's authoritative.**

- It's written for the whole field: "If you write about computer technology, this guide is for you."
- The [Google developer documentation style guide](https://developers.google.com/style) points to it for technical style: "See the Microsoft Writing Style Guide. But consider whether Microsoft's guidance applies".
- UX Writing Hub notes it "replaces the Microsoft Manual of Style, a respected source of editorial guidance for the tech community for more than 20 years." _(Second-hand.)_
- Basecase's `docs/guide/copy.md` already cites its Top 10 tips.

**Key rules.**

| Rule                                    | Exact words                                                                                                                                  | Applies to |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Shorter                                 | "Shorter is always better."                                                                                                                  | C B H      |
| Get to the point                        | "Lead with what's most important. Front-load keywords for scanning. Make customer choices and next steps obvious."                          | C B H      |
| Prune                                   | "Give customers just enough information to make decisions confidently. Prune every excess word."                                            | C B H      |
| Verbs first                             | "Most of the time, start each statement with a verb. Edit out you can when it isn't necessary."                                             | C H        |
| Scanning first                          | "We write for scanning first, reading second."                                                                                               | C B H      |
| Jargon                                  | "Shun jargon and acronyms."                                                                                                                  | C B H      |
| Tone shifts                             | "we adapt our tone—from serious to empathetic to lighthearted—to fit the context and the customer's state of mind."                         | C B H      |
| Above the fold                          | "Content on the first screen (also called above the fold) is the most likely to be read."                                                   | C B H      |
| Stop                                    | "Get to the point." "Then stop."                                                                                                             | C B H      |
| Paragraph length                        | "Three to seven lines is about the right length for a paragraph."                                                                            | C B H      |
| Keywords early                          | "Place important keywords near the beginning of headings, table entries, and paragraphs so they're easy to spot."                           | C B H      |
| Headings matter                         | "If readers don't read the headings, they probably won't read the text that follows, either."                                                | B H        |
| Short headings in blogs                 | "Keep headings as short as possible, and put the most important idea at the beginning. This is especially critical in blogs and social media." | B          |
| Headings about outcomes                 | "In most cases, don't talk about products, features, or commands in headings. Concentrate on what customers can achieve or what they need to know." | B H        |
| Parallel headings                       | "Use parallel structure in headings."                                                                                                        | B H        |
| Task headings                           | "Consider infinitive phrases, such as To create a heading, for headings and titles related to tasks."                                        | H          |
| No heading punctuation                  | "Don't use a period or a colon at the end of titles, headings, subheadings, and UI titles."                                                  | C B H      |
| Intro sentence                          | "An introductory sentence shouldn't just repeat what the heading says."                                                                      | H          |
| One instruction per step                | "Use a separate step for each instruction. It's OK to combine short steps that occur in the same place in the UI."                          | H          |
| Finish the procedure                    | "Most of the time, include actions that complete a procedure, such as selecting an OK or Apply button."                                     | H          |
| Few steps                               | "Don't overwhelm customers with too many steps in a single procedure. Try to fit all the steps on the same screen."                        | H          |
| Place before action                     | "Make sure that customers know where the action should take place before you describe the action."                                           | H          |
| Steps are sentences                     | "Use a complete sentence. Capitalize the first word and use a period at the end."                                                           | H          |
| One step                                | "A single step might not require list formatting."                                                                                           | H          |
| Talk about tasks, not widgets           | "Avoid talking about UI elements. Instead, describe what the customer needs to do."                                                         | H          |
| Bold labels                             | "When you must refer to a button, checkbox, or other option, use bold formatting for the name."                                             | H          |
| Match the UI                            | "Use sentence-style capitalization unless you need to match the UI."                                                                         | H          |
| Drop label punctuation                  | "If an option label ends with a colon or an ellipsis, don't include that end punctuation in instructions."                                  | H          |
| Input-neutral verbs                     | "Don't use input-specific verbs, such as click or swipe."                                                                                    | H          |
| Right-click is allowed                  | "It's OK to use right-click with select and hold when the instruction isn't specific to touch devices."                                     | H          |
| Casing                                  | "Default to sentence-style capitalization"                                                                                                   | C B H      |

---

## Where the guides disagree, and which way Basecase should go

Basecase serves both people who already know URDF, MJCF and servo calibration and people opening a CAD tool for the first time. Two findings settle most of these choices. NN/g found "no major differences in how technical and non-technical users approached reading on the Web", and GOV.UK reports that "the more educated the person and the more specialist their knowledge, the greater their preference for plain English". So Basecase should write one plain style for everyone and serve the two groups with different article types, not different registers.

| Question                        | The guides                                                                                                                                                                  | Basecase should                                                                                                                                                                                                                                                                                    |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contractions                    | GOV.UK: avoid negative ones (‘can’t’, ‘don’t’). Microsoft and Mailchimp encourage contractions.                                                                             | Use contractions, and copy.md already asks for them. Write "do not" and "cannot" in warnings about real hardware (power, motors, the motor lock), where a misread "don't" moves an arm. GOV.UK's reason, misreading, matters most there.                                                         |
| "Click" or "select"             | GOV.UK and Microsoft: "select", because not every input clicks. Both allow "right-click".                                                                                   | Keep "click", "right-click", "press" and "drag". Basecase is a pointer-first desktop CAD app (Mac and Windows), the UI itself says right-click, and "select" already means selecting parts on the canvas. Use "choose" for menu items, as the articles mostly do now.                          |
| Title casing                    | Mailchimp: page titles in title case. Microsoft and GOV.UK: sentence case.                                                                                                  | Keep sentence case for titles and headings (loop.md already says so). Inside the body, write UI labels exactly as the app shows them (Title Case buttons), which Microsoft allows: "unless you need to match the UI".                                                                            |
| How-to titles                   | Diátaxis: "How to integrate…"; a participle title is "bad". GOV.UK: active verb ("Submit…") for doing pages, but its good example is "How to dispose of hazardous waste…". Microsoft: infinitive "To create…" or verb phrase "Create a profile". | Keep the bare imperative ("Import a mesh"). It meets Diátaxis's actual concern (does the title say exactly what it shows?), matches GOV.UK's active verb and Microsoft's "Create a profile", and puts the keyword in the first two words (NN/g). Never use a participle ("Importing meshes").      |
| Question headings               | GOV.UK: never. Microsoft: allowed "if it's needed for meaning".                                                                                                             | No question titles or headings. Troubleshooting titles state the symptom ("Agent shows Sign In after connecting"), which frontloads the words people search for.                                                                                                                                  |
| FAQs                            | GOV.UK bans FAQs. NN/g lists FAQs as a form of reactive help. Mailchimp lists "troubleshooting advice".                                                                     | No FAQ page. Each real question becomes a task, concept or troubleshooting article with a findable title.                                                                                                                                                                                        |
| Related links                   | GOV.UK: no unsorted "Further reading" lists. Mailchimp: up to 4 related articles, ordered step down then step up.                                                           | Link in context first. At most one ordered "Related" pair at the end: one simpler article, one more advanced, never repeating a body link. That satisfies both guides.                                                                                                                         |
| Complete or minimal             | NN/g: reactive help should be "comprehensive and detailed". Diátaxis: how-to "practical usability is more helpful than completeness". GOV.UK: "nothing more".                | Decide by type. How-to stays minimal. Reference is complete (every format, every shortcut, every file in the robot package). Concepts carry the depth. That's how Diátaxis reconciles it.                                                                                                       |
| Humor and warmth                | Mailchimp: dry humor is welcome when natural. Microsoft: "Occasionally, we’re fun." GOV.UK: "emotionless".                                                                  | No jokes in help, changelog or anything about failure, which matches copy.md's "calm and kind, never cute". A blog post may show personality in why something was built, never in claims about it.                                                                                            |
| "We"                            | copy.md bans "we" in UI. GOV.UK allows it once the organisation is named. Diátaxis recommends "In this tutorial, we will…".                                                 | Help how-tos, reference and troubleshooting use "you" only. Blog posts and tutorials may use "we" once Basecase is named, where "we" clearly means the people who build it (blog) or the reader and the guide together (tutorial).                                                            |

---

## Synthesis: rules Basecase could adopt

Each rule is written so a reviewer or a script can check it. Sources are abbreviated: **GOV** (GOV.UK), **NNG**, **DX** (Diátaxis), **MC** (Mailchimp), **MS** (Microsoft).

### Every page (changelog, blog, help)

1. **The first sentence carries the news or the task.** It says what the reader can now do, or what the page helps them do, before any background or definition. _Test:_ the first sentence names the feature or task. It doesn't open with a definition ("A Case in Basecase is…") or with "Until now". _Sources:_ NNG inverted pyramid and "first two paragraphs"; GOV "Put the most important information first"; MS "Lead with what's most important"; MC "Lead with the main point".
2. **No sentence over 25 words; no paragraph over 5 sentences.** _Test:_ a word count per sentence, ignoring code spans and image lines. _Sources:_ GOV (25 words, 5 sentences); MC (25 words); MS (3 to 7 lines).
3. **Plain words, and a specialist term is explained or linked the first time.** URDF, MJCF, LeRobot, PID and IK stay, because experts search for them, but each page explains or links them once. _Test:_ a glossary list of terms; the first use on each page is expanded or linked. _Sources:_ GOV "explain what they mean the first time"; MS "Shun jargon and acronyms"; NNG (experts want plain text too).
4. **Describe, don't sell.** No promotional adjectives or superlatives. _Test:_ extend `BANNED_COPY` with a long-form list for `site/content/` (for example "powerful", "seamless", "effortless", "game-changing", "revolutionary", "magic", "best-in-class"; this list is a proposal, not taken from a guide). _Sources:_ NNG (marketese, objective text measured 27% better); MC "Avoid dramatic storytelling and grandiose claims"; GOV "emotionless".
5. **Headings are descriptive, front-loaded, parallel, sentence case, with no end punctuation and no questions.** _Test:_ a lint flags `?` at the end of a heading, a trailing period, and generic headings (Introduction, Overview, Details, More). _Sources:_ GOV headings; NNG first two words; MS Headings; MC parallel headlines.
6. **Link text names where it goes, and links sit where they're needed.** Never "click here", "here", "more", "Learn more" or "Read this". The same text never points to two different pages. _Test:_ lint link text against that list and check that each link text maps to one URL across the site. _Sources:_ GOV links; MC links; copy.md §3c.
7. **No "please", "simply", "just", "easily" or "successfully".** These are already in copy.md for the UI; extend the check to `site/content/`. _Sources:_ GOV "no need to say ‘please’"; copy.md.

### Changelog

8. **An entry exists only when the person can do or must know something new.** No entries for fixes, polish or renamed labels. _Sources:_ GOV change notes (which matches the bar Basecase already sets in `tools/loop/briefs/telling.md`).
9. **The first paragraph stands alone in the list: one or two sentences, each 25 words or fewer, saying what you can do now and where.** Never "Updated…", "Improved…" or "Various fixes". _Test:_ sentence count and length on the first paragraph; a banned-opener list. _Sources:_ GOV "Do not say the page has been updated without saying what has changed"; GOV "most important information… first"; NNG inverted pyramid.
10. **Name the place and link the help article.** Give the menu path or ⌘K command, and link the matching help article with its title as the link text. _Test:_ an entry whose feature has a help article contains a link to `/help/<slug>`. _Sources:_ GOV change notes "where the change appears"; GOV links in context.
11. **Put the change itself in the entry, as neutral description.** Real names, numbers and limits, not adjectives. _Sources:_ GOV "Include the changed information in the change note itself"; DX reference ("Neutral description"), by analogy.

### Launch blog posts

12. **The news comes in the first paragraph; background follows.** _Test:_ the first paragraph names the new capability. _Sources:_ NNG inverted pyramid; MS above the fold.
13. **A post explains why: the design decisions, the constraints, what it replaces, what it doesn't do yet.** Steps go in the help article, linked. _Sources:_ DX explanation ("design decisions, historical reasons, technical constraints"; "Keep explanation closely bounded"); MC "Tell readers what they need to know".
14. **Posts over about 300 words get short `##` headings that front-load the subject.** _Sources:_ MS "especially critical in blogs"; NNG "meaningful sub-headings (not "clever" ones)".
15. **"We" is fine once Basecase is named.** _Source:_ GOV "Do not assume the audience will know who the ‘we’ is".

### Help center

16. **Every article has exactly one type, declared in front matter.** The types are `task` (how-to), `tutorial` (Get started), `concept` (explanation), `reference` and `troubleshooting` (a how-to that starts from a problem). A task article holds no explanation longer than one sentence; it links to the concept instead. _Test:_ a `type:` field is required; in a task, no paragraph between or after the steps runs over two sentences. _Sources:_ DX four types and the warning against blurring them; NNG reactive help; MC types of educational content.
17. **Titles by type.** Task: verb first, the user's goal, not the tool ("Import a mesh", "Calibrate an emulated robot"). Concept: a noun phrase that reads after "About" ("Checks and blockers", "Cases"). Reference: what's listed ("Keyboard shortcuts", "Robot package contents"). Troubleshooting: the symptom as the person would describe it, as a statement. Never the content type ("guide", "tutorial", "FAQ"). _Test:_ titles are 65 characters or fewer and unique, and a task title starts with a verb. _Sources:_ GOV titles; DX naming and "about"; MS headings.
18. **Titles and summaries use the words people search for.** Each article lists its search terms in front matter (`search: [STL, OBJ, 3MF, import model]`), and the title uses the most common one. _Test:_ the field is present and the site search indexes it. _Sources:_ GOV "common search terms"; NNG "Optimize for search"; MS "choose words they'd use themselves".
19. **The summary (first paragraph, which the site already uses as the page's meta description) is 160 characters or fewer, ends with a full stop and adds words the title lacks.** _Test:_ length, final period, and word overlap with the title. _Sources:_ GOV summaries; MS "An introductory sentence shouldn't just repeat what the heading says".
20. **Steps: numbered, imperative, one action each, place before action, full sentences, ten at most.** Combine actions only when they happen in the same place. The last step is the one that finishes the task. Alternatives (⌘K, drag and drop) come after the steps, or as a conditional step ("To space three or more parts, click…"); one main path through the steps. _Test:_ at most 10 steps per list; each ends with a period; flag " or " joining two different actions in one step. _Sources:_ MS step-by-step; GOV steps; DX conditional imperatives.
21. **UI labels are bold and spelled exactly as in the app, with no trailing ellipsis; menu paths use ▸.** _Test:_ every bold run in `site/content/help/` matches a string the copy extractor (`tools/copy/extract.mjs`) finds in `src/`, which also catches articles that go stale after a rename. _Sources:_ MC "as they appear in the app"; MS bold labels and dropped ellipses; GOV bold for interface elements.
22. **Screenshots follow the step they show, are cropped to the action, and have alt text that says what's on screen. The steps work without them.** _Test:_ every image has alt text that isn't "screenshot" or "image"; no step depends on "as shown below". _Sources:_ MC "crop screenshots tightly around the action"; NNG "graphics and videos as a secondary information source".
23. **Collections follow the robotics loop, not the code.** The collections are Get started, Design, Engineer, Simulate and train, Build and print, Operate, and Fix a problem. Each article declares one `collection:`, and the Help index shows a few top articles first. _Test:_ field required; the index groups by it. _Sources:_ NNG "Group help topics" and "Highlight top content"; DX "around features of a product. This is rarely successful"; GOV titles that make sense "in document collections".
24. **Troubleshooting articles replace FAQs.** Each covers one problem, titled by the symptom. It opens with the likely cause in one sentence, gives numbered steps to fix it, and ends with how to tell it worked. Error messages the app shows are quoted exactly, so searching the message finds the article. The app links to the article from the error (pull help). _Sources:_ GOV no FAQs; NNG reactive help and "Favor pull over push revelations"; MS "Enclose error messages in quotation marks"; DX how-to "addressed to problems".
25. **Articles link to each other.** Every task links its concept and the task that usually comes next. Every concept links its tasks. At the end, at most one simpler and one more advanced article. No orphans. _Test:_ build-time check that every help article is linked from at least one other article or the index group, and none ends in a link list longer than two. _Sources:_ GOV links in context; MC related articles (step down, step up); DX "if they’re important, link to them".
26. **Requirements say "must"; options say "can"; hardware warnings come before the step they apply to and use "do not".** _Sources:_ GOV "must" / "need" / "can" and negative contractions. Applying this to robot hardware is Basecase's own extension.
27. **First-time users get tutorials; experts get reference.** At least one Get started tutorial that always works from a blank scene to a moving robot, showing the goal first and the expected result at every step. _Sources:_ DX tutorials ("works for every user, every time"; "form an idea of what they will achieve"); NNG proactive help "accessible elsewhere".

---

## Gaps in Basecase today

### `docs/guide/copy.md`

- **It covers UI strings only.** It has no rules for long-form text. The rules for the site live in two other places: `docs/guide/loop.md` ("Writing posts and help") and `tools/loop/briefs/telling.md`. None of the three has sentence or paragraph limits, title or summary lengths, article types, heading rules, link-text rules beyond "Learn more", or anything on troubleshooting, collections or search terms.
- **Its checks don't reach the site.** `basecase/copy` and the copy budget lint `src/` only, so banned words in `site/content/` (please, just, "we" without a subject) go unchecked.
- **What it already does well**, and the guides agree with: verbs first, no "please" or "simply", front-loading, naming things for what they are, exact numbers, calm tone, and sentence case for titles (loop.md).

### Help articles (`site/content/help/`, 12 articles)

Measured on 2026-11-13 with a script over the files (summary = first paragraph, which the site uses as the meta description):

| Article                           | Summary (chars) | Sentences over 25 words | Bold UI labels | Images | Links to other articles |
| --------------------------------- | --------------- | ----------------------- | -------------- | ------ | ----------------------- |
| align-and-spread-parts            | 97              | 0                       | no             | 2      | 0                       |
| calibrate-an-emulated-robot       | 122             | 0                       | no             | 3      | 0                       |
| choose-the-agent                  | 163             | 1 (29 words)            | yes            | 1      | 0                       |
| export-a-robot-package            | 122             | 0                       | yes            | 2      | 0                       |
| get-a-robot-ready-to-build        | 94              | 1 (26)                  | no             | 2      | 0                       |
| import-a-mesh                     | 131             | 0                       | yes            | 0      | 0                       |
| import-a-robot                    | 106             | 0                       | yes            | 2      | 0                       |
| measure-a-part                    | 118             | 1 (32)                  | no             | 2      | 0                       |
| open-a-shared-scene               | 39              | 0                       | yes            | 0      | 0                       |
| publish-a-dataset-to-hugging-face | 148             | 0                       | yes            | 2      | 0                       |
| save-a-model-to-the-library       | 85              | 0                       | yes            | 2      | 0                       |
| share-a-scene                     | 57              | 0                       | yes            | 0      | 0                       |

What already matches the guides: imperative, verb-first titles in sentence case; a one-sentence purpose before the steps; numbered imperative steps; descriptive alt text; `covers` paths that tie each article to the code it documents.

What the guides demand that's missing:

1. **Only one type exists.** All 12 are how-tos. There are no tutorials for first-time users, no concept articles (Checks, Cases, Skills, the Ladder in Operate, stand-ins vs real parts), no reference pages (keyboard shortcuts, supported file formats, robot package contents) and no troubleshooting articles (agent won't connect, import finds no robot, a check stays red). (DX, NNG.)
2. **No collections, no top articles, no search.** `/help` is one flat list (`EntryList`, described as "How to do things in Basecase."), and the pages are static with no script. (NNG "Group help topics", "Optimize for search", "Highlight top content".)
3. **No links between articles:** zero across all 12. For example, open-a-shared-scene and share-a-scene don't link each other, and import-a-mesh doesn't link save-a-model-to-the-library. (GOV, MC, DX.)
4. **Bold UI labels are inconsistent.** Four of 12 articles don't bold labels at all (align, calibrate, get-a-robot-ready, measure); the other eight do. (MC, MS, GOV.)
5. **Alternatives inside steps.** For example, align step 2 ("Right-click the selection and point at Align ▸, or look at Align in the Inspector…"), measure step 1 (three ways to start) and import-a-robot step 1 ("It's also in File ▸ Import Robot and the + …"). (MS "Use a separate step for each instruction".)
6. **Explanation and reference mixed into tasks.** export-a-robot-package lists the zip's contents, which is reference. get-a-robot-ready-to-build ends with a paragraph on Print mode that is a second task. calibrate step 4 explains three verdicts, which is a concept. (DX "action and only action".)
7. **Summaries.** choose-the-agent's runs to 163 characters. open-a-shared-scene's ("Open a `.basecase` file someone sent you.") mostly repeats its title. (GOV summaries.)
8. **Search terms.** Titles use the app's words ("mesh", "model", "scene"), and there is no record of the words people actually search for, such as STL or URDF. _(No search data exists to confirm which terms people use; this needs real queries.)_ (GOV "common search terms".)
9. **No requirements or warnings language** for steps that touch real hardware, which matters once Operate drives physical servos. (GOV "must".)

### Changelog (`site/content/changelog/`, 8 entries)

- Seven of eight entries are one paragraph of 33 to 58 words. Their first paragraphs run 207 to 312 characters, and six of the eight have a sentence over 25 words. For example, calibrate-servos packs the place, the ⌘K command, the verdicts and Roll Back into a single 30-word sentence. (GOV, MC sentence limits; NNG scannable.)
- `telling.md` now asks for 150 to 500 words under `##` headings, with screenshots. Only publish-datasets-to-hugging-face (330 words, three images) meets it.
- No entry links to its help article, though five of them (calibrate, export a robot package, import robot, align, publish datasets) have one. (Rule 10.)
- The entries do follow GOV.UK's bar: real changes only, specific names and places, no "updated".

### Blog (`site/content/blog/`, 1 post)

- datasets-on-hugging-face opens with a definition of a Case and "Until now…". The news ("Now there's Publish to Hugging Face…") arrives in paragraph two. (NNG inverted pyramid; rule 12.)
- Three sentences run over 25 words (26, 38 and 26).
- It doesn't link the help article or the changelog entry.
- It does what the guides want of a post: concrete facts (v2.1 tag, LFS uploads, token kept in the main process), the why behind decisions (one repo per Case per scene), and no hype.

### What a real help center still needs, in order

1. Add `type`, `collection` and `search` to the front matter, and group `/help` by collection with a short list of top articles (rules 16, 18, 23).
2. Write one Get started tutorial from a blank scene to a moving robot, and concept pages for Checks, Cases and the Operate Ladder (rules 16, 27).
3. Add troubleshooting articles for the errors people actually hit, quoting each error exactly and linked from the app (rule 24).
4. Add cross-links, and a build check that finds orphan articles (rule 25).
5. Lint `site/content/` for sentence length, summary length, title length, banned words, link text, and bold labels that match app strings (rules 2, 6, 7, 17, 19, 21).
6. Add search to `/help`. A static index built at site build time fits the no-script pages, but whether that's acceptable is a decision for a maintainer.

---

## Sources fetched (2026-11-13)

- GOV.UK: https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/ and the pages linked in section 1; https://insidegovuk.blog.gov.uk/2026/06/08/launching-gov-uks-new-content-and-publishing-guidance/; https://gds.blog.gov.uk/2014/06/19/improving-the-norwegian-user-experience/
- NN/g: https://www.nngroup.com/articles/how-users-read-on-the-web/; https://www.nngroup.com/articles/concise-scannable-and-objective-how-to-write-for-the-web/; https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content/; https://www.nngroup.com/articles/inverted-pyramid/; https://www.nngroup.com/articles/help-and-documentation/; https://www.nngroup.com/about/
- Diátaxis: https://diataxis.fr/, /tutorials/, /how-to-guides/, /reference/, /explanation/, /map/
- Mailchimp: https://styleguide.mailchimp.com/, /writing-principles/, /voice-and-tone/, /writing-educational-content/, /web-elements/, /tldr/, /further-reading/
- Microsoft: https://learn.microsoft.com/en-us/style-guide/welcome/ and the pages linked in section 5
- Google: https://developers.google.com/style (for its pointer to Microsoft)
- Secondary, for authority only: https://uxwritinghub.com/content-style-guides/; https://workingincontent.com/resources/content-style-guides
- Not reachable: https://guides.18f.gov/content-guide/ (DNS failure), so the 18F claim stays unverified.
