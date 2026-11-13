# Copy and labels

Part of the Basecase guide. [AGENTS.md](../../AGENTS.md) holds the rules every change follows and the index of these files; section numbers (§) are shared across them.

## 3. Copy & Labeling Rules

Every word in the UI is product copy. Write it to the standard below, and check it against the checklist (§3d) before shipping. These rules distil Apple's HIG “Writing”, the Microsoft Writing Style Guide, NN/g's error-message and empty-state guidelines, Mailchimp's Voice & Tone guide, and Monzo's tone of voice. They're tested against product copy those sources and the wider industry celebrate (§3e).

### 3a. Principles

1. **Every word earns its place.** Read it aloud, then cut. “Check each word to be sure it needs to be there. If you can use fewer words, do so” (Apple). “Bigger ideas, fewer words” (Microsoft): “Ready to buy? Contact us.”
2. **Never say what the UI already shows.** If a number, total, icon, state or the layout already tells the person something, the text must not repeat it. `$0` already says there's nothing to buy, so a “Nothing to buy yet” caption is noise. Show no caption at all rather than a redundant one.
3. **Name things for what they are, not for what they aren't.** Use “Supplies”, not “Not in the model”, and “No chats”, not “No past chats yet”. Labels are nouns for things and verbs for actions.
4. **Lead with what matters to the person** (Monzo: “lead with impact”; Microsoft: “get to the point fast”). Front-load the keyword or the action: “Recheck 2 prices before ordering”, not “2 prices are over 60 days old. Recheck…”.
5. **Make the next step obvious.** When text points at work to do, start with the verb and make it clickable: “Replace 2 stand-ins with real parts”, “Fix 3 parts before printing”.
6. **Plain and specific.** Use everyday words, active voice and contractions (it's, they're); no jargon the person didn't bring. Use exact numbers and names, not vague ones (“3 to price”, not “some items”).
7. **Calm and kind, never cute.** No “Oops”, “Uh-oh”, exclamation marks, or jokes in errors or anything that blocks work. Don't blame the person. Apologize only when the app is at fault, and only once.
8. **Consistent.** The same word for the same thing everywhere, and the same pattern for the same kind of message (§3b).

### 3b. Rules by element

1. **Casing:**
   - Title Case for buttons and menu items (macOS): “Export STL”, “Save to Library”, “Zoom to Selection”, “Add Price”.
   - Sentence case for tooltips, section titles, headers, helper text, placeholders, toasts and errors.
2. **Buttons are verbs**, 1–3 words, saying what happens: Add, Save, Apply, Done, Export STL, Add Price, Browse Parts. Never “OK”, “Submit”, “Yes”, “Continue” where a real verb exists, or “Click here”.
3. **Export:** one Export button (Title Case, never all caps) in the title bar, between Redo and the inspector toggle, whether or not the inspector is open. It opens a menu of formats: PNG Image, STL Mesh, 3MF Plates, Basecase Scene, Robot Package (§8d, off until the scene has a movable joint), Copy as Markdown and AirDrop, with labels only (no descriptions). Saving the scene is **Save Scene** (⌘S), in the File menu, ⌘K and the Library header.
   - **AirDrop** (also File menu and ⌘K) sends the visible solid parts, as posed on the canvas, to an iPhone as a USDZ, which opens in AR Quick Look at real size. `three/usdz/` builds it in a worker (three's `USDZExporter`, `quickLookCompatible`): meshes are baked into world space in meters (mirrored parts get their winding flipped, since USD has no negative scale), centred and stood on the floor, one material per colour; textures aren't exported. `electron/shareFile.mjs` writes it to the temp folder and opens AirDrop directly as a sheet on the window, through a native addon (`electron/native/sharing/`, Objective-C++ on Node-API: `NSSharingService` `sendViaAirDrop`, its delegate returning our window). Node-API is ABI-stable, so Electron upgrades need no rebuild; `npm install` builds it on macOS (`prepare` → `tools/native/build.mjs`, node-gyp; `npm run native` rebuilds it, output in the gitignored `build/`). Without the addon it falls back to the macOS share menu (`ShareMenu`) at the pointer, and outside Electron the file downloads. The spinner toast stays until AirDrop opens.
4. **No ellipses in labels.** Menu items, palette commands, buttons and tooltips never end in “…”, even when a sheet or picker follows: “Import SVG”, “From Image”, “Add Part”, “Add Price”, “Settings”. Progress text (“Saving…”, “Thinking…”) keeps it.
5. **Tooltips = name + shortcut**, with no period: `Move  V`, `Undo  ⌘Z`. Add a short sentence only for non-obvious tools.
   - Write shortcuts with Mac glyphs (`⇧⌘Z`) everywhere. `Kbd` turns them into Windows key caps (`Ctrl` `Shift` `Z`, `platformKeys`), so never write “Ctrl” by hand. A modifier inside a sentence goes through `modifierName('⌥')` (“Hold Alt to invert”). File-manager wording comes from `REVEAL_LABEL` (“Show in Finder” / “Show in Explorer”). Platform checks in the renderer use `src/utils/os.ts` (`IS_MAC`, `IS_WINDOWS`, `hasPrimaryModifier`): ⌘ on macOS is Ctrl on Windows, and Ctrl-click is a right-click only on macOS.
6. **Section titles and headers** name the content: “Budget”, “Bill of materials”, “Supplies”, “Printed parts”. No questions, instructions or negations.
7. **Empty states:**
   - If something on screen already shows the emptiness (a $0 total, a 0 count, a lone section header, settings with nothing under them), show **no** empty text.
   - Otherwise use a short noun phrase, plus one action when there's a useful next step: “No parts” + [Browse Parts], “No saved scenes”, “No chats”.
   - Never add a description that restates the title (“No parts yet” / “Parts you add appear here.”). Never use “yet”, “nothing to … yet”, “will appear here” or “show up here”.
   - Inspector sections never explain how to use a feature (“Pin notes to any spot in 3D. Press M…”). An empty section shows just its title and header action; the tooltip carries the shortcut.
8. **Captions under numbers** add information the number lacks (“2 of 5 prices checked”, “$40 left” and “3 to price” on one `MetaLine`), or they don't exist.
9. **Errors and warnings:** say what happened, then how to fix it, next to the problem. Prefer the fix to the fault (Apple: “Choose a password with at least 8 characters”, not “That password is too short”). Example: “Nothing to subtract. Overlap a Cutout or Shift-click a part.” No error codes in the UI and no robotic “Invalid X”.
10. **Notices that ask for work** start with the verb and select or open the things they're about: “Replace 2 stand-ins with real parts”.
11. **Placeholders show an example**, never instructions: “e.g. 4× M3 holes, 0.2 mm clearance”.
    - Search fields are the exception: they name what they search, “Search parts”.
12. **Destructive actions ask first.** Deleting, removing or clearing anything a person made opens a confirmation (`confirmAction` or `ConfirmDialog`: title “Delete ⟨name⟩?”, Cancel and Delete) before anything happens. Asking already says it's for good, so the dialog has no body unless something else goes too (“Its tries go with it.”), and never “You can’t undo this”; a toast with Undo may follow. Never delete on the first click, on double-click, or at once with only an Undo toast, and never arm a button on the first click and act on the second. The exception is removing parts from the scene (⌫, Delete in the Inspector or right-click menu): that's ordinary editing, so it happens at once with a “Deleted ⟨name⟩” toast and Undo. Removing a step from a Routine (⌫ or right-click Delete) is ordinary editing too: at once, with a “Deleted ⟨step⟩” toast and Undo. Agent tools (`delete_parts`) don't ask.
13. **Toasts confirm in past tense** and name the thing, with Undo for destructive or bulk actions: “Deleted Cube” + [Undo], “Saved Robot Arm”, “Exported STL”. Not a bare “Saved” or “Done”, and never “successfully”.
14. **Footnotes and fine print:** one line, front-loaded, fragments are fine. A footnote that repeats the settings and numbers above it doesn't exist: under Printing, the ≈ on the time already says it's an estimate and Slice is right there.
15. **Numbers:**
    - Tabular figures, units in a muted suffix (`mm`, `°`, `%`).
    - Use `×` for sizes: `40 × 36 × 20`.
    - Use numerals, not words (“3 parts”), and pluralize correctly (“1 part”, “2 parts”).
16. **No middle dots (`·`) between items, and no other separator glyph in their place** (a pipe, `•`, `—`). Separate facts with layout instead:
    - a meta line of facts: `MetaLine` (items 12px apart; `SectionHeader` and the part page and hover card subtitles take a list and use it);
    - a spec value with several facts: a list (`SpecValue`), rendered one per line by `SpecText`;
    - several shortcuts or settings: one row each (“Group ⌘G”, “Ungroup ⇧⌘G”), never “Group · Ungroup”;
    - one string (toasts, tooltips, labels): a plain sentence (“Inserted G1 with 23 joints”, “Connected to Claude”, “Printed TPU”).
    - Unit dots (`N·m`, `kg·cm`) are multiplication signs, not separators, and stay. In docs, “⟨text⟩” + [Action] notes a message with its button.
17. **Same word everywhere for the same thing:**
    - Parts are added, models are inserted, scenes are opened (in a tab) and closed, comments are posted, prices are added and checked.
    - Part types are **Solid / Cutout / Guide**.
18. **Icon-first.** Our own icons (`src/design-system`, §14) with custom tooltips (the `Tooltip` primitive), never native `title` on buttons. There's no third-party icon set.
    - When the library has nothing that reads clearly, draw a new icon with the `icon-design` skill (`.agents/skills/icon-design/SKILL.md`): 24 grid, 2px round strokes, an outline/filled pair for anything that toggles, previewed beside its neighbours before shipping.
19. **No status dots** unless they report an error or a live background process. The agent panel shows connection state only when disconnected.

### 3c. Words and patterns to avoid

One list holds the banned words and separators: `BANNED_COPY` in [`verify/rehearsal/uiRules.ts`](../../verify/rehearsal/uiRules.ts), which the copy budget below, the Stage 7 rehearsal's screen scan and the lint all read. `basecase/copy` (`tools/eslint/copy.mjs`) lints the entries that [`tools/copy/banned.mjs`](../../tools/copy/banned.mjs) gives a fix, in JSX text, toasts and confirms in `src/` and the app menu, and in the props and properties listed in [`tools/copy/surfaces.mjs`](../../tools/copy/surfaces.mjs) (`label`, `title`, `placeholder`, `aria-label`, `alt`, `heading`, `message`…). The list is under `verify/`, so a new word needs a maintainer's OK (§0k); give it a fix in `tools/copy/banned.mjs` to lint it too. “just”, “We”, “Your”, “!” and the rest of the table still need a reader.

| Avoid | Why | Use instead |
|---|---|---|
| “yet” (“No parts yet”) | Filler; the person knows they can add more | “No parts” |
| “Nothing to … yet” | Usually restates a visible 0 or $0 | No text, or a noun phrase |
| “… will appear here”, “show up here” | Explains the obvious | Omit, or name the action |
| “Not in …”, “Non-…”, “Un…” as a label | Defines by absence | Name the thing (“Supplies”) |
| “Please”, “simply”, “just”, “easily”, “successfully” | Padding or condescending | Cut |
| “We”, “Your …” | Unclear who “we” is; “Your Favorites” = “Favorites” (Apple) | Omit the pronoun |
| “Oops”, “Uh-oh”, “!” | Insincere, especially in errors (Apple, NN/g) | State the problem and fix |
| “Invalid …”, “Error: …”, codes | Robotic, not actionable | What to do instead |
| Blanket disclaimers (“Tried in simulation only”, “Experimental”, “Results may vary”) | Nothing to act on, repeated on every screen | Cut. When a result is limited, show the measured limit next to it |
| A refusal that lists what's missing (“Drive needs an arm, wheels or at least four legs”) | Leaves the person stuck with a fact | The button that gets there (“Teach It to Move”), or hide the control when nothing can |
| A fixed menu of tasks where the person could ask for anything (Stand / Walk) | Caps what they can do at what we thought of | A field or `/train` that takes any goal, with the robot's own skills as examples |
| “Click here”, “Learn more” alone | Doesn't say where it goes | Describe the destination |
| “AI brief”, “AI …” as a feature name | Names our plumbing, not what the person gets | Name the result: “Save Scene”, “Copy as Markdown” |
| Quotes around placeholder examples | Visual noise | “e.g. Open Duck Mini, about 40 cm tall” |
| “You can …”, “There is/are …” | Weak openers (Microsoft) | Start with the verb |
| “a · b” (a middle dot, or a pipe or `•` in its place) | Text pretending to be layout | `MetaLine`, a line per value, separate rows, or a sentence (§3b-16) |

### 3d. Checklist before shipping any UI text

- [ ] Read it aloud. Could it lose a word, or a whole line?
- [ ] Does anything on screen already say this (a number, an icon, a state, the section title)? If so, delete it.
- [ ] Does it name a thing, or describe its absence? Name the thing.
- [ ] If it asks for work, does it start with the verb, and does clicking it help do the work?
- [ ] Is the most important word first?
- [ ] Same word as everywhere else for this thing? Right casing for this element?
- [ ] No banned words (“yet”, “please”, “Oops”, “Invalid…”; §3c) and no `·` or stand-in glyph between items (§3b-16)? `basecase/copy` lints both; the rest of §3c is yours to catch.

**The copy budget.** On every pull request, Check's `copy` job (`tools/check-copy-budget.mjs`, logic in `tools/copy/`) collects the user-facing strings in each changed `src/` file before and after: JSX text, the props and properties in `tools/copy/surfaces.mjs` (`aria-label`, `title`, `label`, `alt`, `hint`, and the `label`, `text`, `detail` and `message` properties of any object…), and `showToast` / `toastInFront` / `notify` / `confirmAction` arguments. Tests, `src/data/` and strings that are only symbols, numbers, units, ids or paths are skipped. It prints `Copy: +N −M` and fails when:

- the change adds more strings than it removes and a new one has no line `copy: "<string>" — <why the screen needs it>` in the body's Copy section (the loop fills it from its answer's `copy` field, for every kind of pull request; a template without a Copy section gets one appended). Removing strings never needs a reason, and repeating a string the file already has doesn't either;
- an added string uses a word §3c bans (the whole `BANNED_COPY` list, “we” and “Your” included), whatever the net.

Run it locally with `node tools/check-copy-budget.mjs origin/main..HEAD` (`PR_BODY` holds the body). Check runs on pushes, not on body edits, so a `copy:` line added to the body afterwards counts only once another commit is pushed; a reason belongs in the answer's `copy` field from the start.

**The count.** `node tools/copy-diff.mjs [base] [head]` lists the strings a change adds, changes and removes, and its net (`Copy: 2 added, 1 changed, 1 removed, net +1`), from the same extractor (`tools/copy/extract.mjs`). A removed string and an added one in the same file and position (both JSX text, both a `title`, both a `showToast` argument…) count as one changed string. With no arguments it compares your working tree, uncommitted work included, to where it forked from `origin/main`, so run it before you finish. The review lane runs it on every pull request and puts the list in its prompt and comment (Loop, §0l).

### 3e. Reference examples

Celebrated product copy and what it teaches:

- **Microsoft:** “Ready to buy? Contact us.” replaced a 16-word sentence; “Invalid ID” became “You need an ID that looks like this: someone@example.com”. Cut to the decision, and replace a fault with an instruction.
- **Datadog** (cited by NN/g): an empty favorites list says “Star your favorites to list them here”. An empty state teaches the one action that fills it.
- **Mailchimp:** password rules that grey out one by one as you meet them, instead of an error after you submit. Prevent the error, and give feedback in place.
- **Monzo:** “We've blocked your card and ordered you a new one” instead of “Your card was blocked and a replacement has been requested”. Active voice, impact first, the person's outcome in plain words.
- **Slack:** Slackbot says plainly that it's “only a bot”, and empty channels tell you you're caught up. Honest framing and a calm tone.

Before → after in this app:

| Before | After | Rule |
|---|---|---|
| $0 + “Nothing to buy yet” | $0 (no caption) | Don't repeat what the number shows |
| “Not in the model” | “Supplies” | Name the thing, not its absence |
| “No parts yet” / “Parts you add appear here.” | “No parts” + [Browse Parts] | No “yet”; no restating description |
| “$40 left before unchecked prices” | “$40 left” and “3 to price” (a `MetaLine`) | Specific numbers, plain words |
| “2 parts need changes to print well” | “Fix 2 parts before printing” | Verb first for work to do |
| “3 estimated stand-ins to replace with real parts” | “Replace 3 stand-ins with real parts” | Verb first |
| “Check” | “Add Price” | Button says what happens |
| “Saved” | “Saved Robot Arm” (the scene's name) | Toasts name the thing |
| “Save AI Brief”, “Copy AI Brief” | “Save Scene”, “Copy as Markdown” | Name the action, not an internal artifact |
| “What are we building?” | “What should Claude build?” | Say who “we” is |
| “Describe a part, or paste a photo” (placeholder) | “e.g. Desk lamp arm with three servo joints” (never a copy of a suggestion shown above it) | Placeholders show an example |
| “Save a part, import an SVG, or ask the agent to make one.” | “No models” | Empty states are a noun phrase |
| “No matches” + “Nothing found for “servo”.” | “No matches for “servo”” | Don't restate the title |
| “Save and Sync” (File menu, ⌘S) | “Save Scene” | One name per action everywhere |
| “Saved with today's date. Recheck after 60 days.” (under the price form) | No footnote; a stale price turns amber and its tooltip says why | Don't explain what the app handles for you |

Sources: [Apple HIG: Writing](https://developer.apple.com/design/human-interface-guidelines/writing), [Microsoft: Top 10 tips for style and voice](https://learn.microsoft.com/en-us/style-guide/top-10-tips-style-voice), [NN/g: Error-message guidelines](https://www.nngroup.com/articles/error-message-guidelines/), [NN/g: Designing empty states](https://www.nngroup.com/articles/empty-state-interface-design/), [Mailchimp Voice & Tone](https://styleguide.mailchimp.com/voice-and-tone/), [Monzo tone of voice](https://monzo.com/tone-of-voice), [Econsultancy: 15 microcopy examples](https://econsultancy.com/15-marvellous-microcopy-examples-and-how-they-improve-ux/).
