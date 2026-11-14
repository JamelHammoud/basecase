# Copy and labels

Part of the Basecase guide. [AGENTS.md](../../AGENTS.md) holds the rules every change follows and the index of these files; section numbers (§) are shared across them.

## 3. Copy & Labeling Rules

Every word in the UI is product copy. Write it to the standard below, and check it against the checklist (§3d) before shipping. These rules distil Apple's HIG “Writing”, the Microsoft Writing Style Guide, NN/g's error-message and empty-state guidelines, Mailchimp's Voice & Tone guide, and Monzo's tone of voice. They're tested against product copy those sources and the wider industry celebrate (§3e). The changelog, blog and help center follow §3f as well.

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
     - Title Case keeps articles (a, an, the), conjunctions (and, but, nor, or) and prepositions of four letters or fewer (as, at, by, for, from, in, into, near, of, off, on, onto, per, to, via, with) lowercase, unless one starts or ends the label or belongs to its verb: “Train from Tries”, “Drive with Camera”, “Screws into Parts”, but “Compare With”, “Set Up Servos”, “Hand Off to a Spot”. A label built from words goes through `titleCase` (`src/utils/titleCase.ts`).
   - Sentence case for tooltips, section titles, headers, helper text, placeholders, toasts and errors.
2. **Buttons are verbs**, 1–3 words, saying what happens: Add, Save, Apply, Done, Export STL, Add Price, Browse Parts. Never “OK”, “Submit”, “Yes”, “Continue” where a real verb exists, or “Click here”.
3. **Export:** one Export button (Title Case, never all caps) in the title bar, between Redo and the inspector toggle, whether or not the inspector is open. It opens a menu of formats: Image, STL, 3MF Plates, STEP (desktop only), Scene, Robot Package (§8d, off until the scene has a movable joint), Copy as Markdown and AirDrop, with labels only (no descriptions). Each format is named as in ⌘K and the File menu without the verb (Export Image, Export STL, Export Scene…), and has the same icon there.
   - **AirDrop** (also File menu and ⌘K) sends the visible solid parts, as posed on the canvas, to an iPhone as a USDZ, which opens in AR Quick Look at real size. `three/usdz/` builds it in a worker (three's `USDZExporter`, `quickLookCompatible`): meshes are baked into world space in meters (mirrored parts get their winding flipped, since USD has no negative scale), centered and stood on the floor, one material per colour; textures aren't exported. `electron/shareFile.mjs` writes it to the temp folder and opens AirDrop directly as a sheet on the window, through a native addon (`electron/native/sharing/`, Objective-C++ on Node-API: `NSSharingService` `sendViaAirDrop`, its delegate returning our window). Node-API is ABI-stable, so Electron upgrades need no rebuild; `npm install` builds it on macOS (`prepare` → `tools/native/build.mjs`, node-gyp; `npm run native` rebuilds it, output in the gitignored `build/`). Without the addon it falls back to the macOS share menu (`ShareMenu`) at the pointer, and outside Electron the file downloads. The spinner toast stays until AirDrop opens.
4. **No ellipses in labels.** Menu items, palette commands, buttons and tooltips never end in “…”, even when a sheet or picker follows: “Import”, “From Image”, “Add Part”, “Add Price”, “Settings”. Progress text (“Loading…”, “Checking it stays up…”, “Starting motors…”) keeps it, unless a percentage beside it already shows progress (“Training 45%”); the agent's step labels shimmer instead (§9).
5. **Tooltips = name + shortcut**, with no period: `Move  V`, `Undo  ⌘Z`. Add a short sentence only for non-obvious tools.
   - A button or choice that shows its name gets a tooltip only for its shortcut or for a fact its label leaves out: Subtract names the part it keeps, Drive says a gamepad works, Export Dataset says only passed tries go. A tooltip that rephrases the label (Union “Merge into one solid”, Push “Push the robot sideways”, a brush's “Relax the surface”) doesn't exist.
   - Write shortcuts with Mac glyphs (`⇧⌘Z`) everywhere. `Kbd` turns them into Windows key caps (`Ctrl` `Shift` `Z`, `platformKeys`), so never write “Ctrl” by hand. A modifier inside a sentence goes through `modifierName('⌥')` (“Hold Shift while scrolling to pan”). File-manager wording comes from `REVEAL_LABEL` (“Show in Finder” / “Show in Explorer”). Platform checks in the renderer use `src/utils/os.ts` (`IS_MAC`, `IS_WINDOWS`, `hasPrimaryModifier`): ⌘ on macOS is Ctrl on Windows, and Ctrl-click is a right-click only on macOS.
6. **Section titles and headers** name the content: “Budget”, “Bill of materials”, “Supplies”, “Printed parts”. No questions, instructions or negations.
7. **Empty states:**
   - If something on screen already shows the emptiness (a $0 total, a 0 count, a lone section header, settings with nothing under them), show **no** empty text.
   - Otherwise use a short noun phrase, plus one action when there's a useful next step: “No parts” + [Browse Parts], “No saved scenes”, “No chats”.
   - Never add a description that restates the title (“No parts yet” / “Parts you add appear here.”). Never use “yet”, “nothing to … yet”, “will appear here” or “show up here”.
   - Inspector sections never explain how to use a feature (“Pin notes to any spot in 3D. Press M…”). An empty section shows just its title and header action; the tooltip carries the shortcut.
8. **Captions under numbers** add information the number lacks (“2 of 5 prices checked”, “$40 left” and “3 to price” on one `MetaLine`), or they don't exist.
9. **Errors and warnings:** say what happened, then how to fix it, next to the problem. Prefer the fix to the fault (Apple: “Choose a password with at least 8 characters”, not “That password is too short”). Example: “Nothing to subtract. Overlap a Cutout or Shift-click a part.” No error codes in the UI and no robotic “Invalid X”. A caught error reaches the screen through `errorMessage` (`src/utils/errorMessage.ts`), never `String(err)`: it shows the error's own sentence, without the “Error:” that `String` adds or Electron's “Error invoking remote method ‘…’:” wrapper. An HTTP status, exit code or signal never reaches the screen: a refusal from an outside service goes through `serviceRefusal` (`electron/refusal.mjs`: “Onshape is limiting requests. Import again in a minute.”, or the service's own reason after “refused the request:”), and a process that stops without a reason says so and names the step to run again (“The slicer stopped without saying why. Slice again.”). An error ends on its fix (“Install Bambu Connect from bambulab.com.”), never with “then try again” after it; when doing it again is the whole fix, it names the step (“Print the plate again.”, “Check again in a minute.”), and its button says the same (Search Again, not Try Again). Agent-facing tool results keep the status, which the agent can act on. An error fixed in a Settings pane names it as a menu path, “in Settings ▸ Accounts”, and its toast gets an Open button to that pane (`settingsPaneIn` in `src/app/settingsPanes.ts`, applied by the workspace's `useToast`); shown inside that pane, it drops the path (`withoutSettingsPath`). A printer's or another app's own menus keep their own path with “→”, so they never match.
10. **Notices that ask for work** start with the verb and select or open the things they're about: “Replace 2 stand-ins with real parts”.
11. **Placeholders show an example**, never instructions: “e.g. 4× M3 holes, 0.2 mm clearance”, “e.g. Move this hole 2 mm left” in a comment, “e.g. Too thin” on a mark. Not “Add a comment”, “Reply” or a field's own name. `basecase/copy` fails a placeholder of plain words that isn't a search field's ([`tools/copy/placeholder.mjs`](../../tools/copy/placeholder.mjs)).
    - Search fields are the exception: they name what they search, “Search parts”, “Search commands” (⌘K). A search with no result shows “No matches for “⟨query⟩”” through `NoMatches`, which trims the query, in every search in the app: ⌘K, Parts, Robots, Objects, Library, Layers and the Scenes menu.
12. **Destructive actions ask first.** Deleting, removing or clearing anything a person made opens a confirmation (`confirmAction` or `ConfirmDialog`: title “Delete ⟨name⟩?”, Cancel and Delete) before anything happens. Asking already says it's for good, so the dialog has no body unless something else goes too (“Its tries go with it.”), and never “You can’t undo this”; a toast with Undo may follow. Never delete on the first click, on double-click, or at once with only an Undo toast, and never arm a button on the first click and act on the second. The exception is removing parts from the scene (⌫, Delete in the Inspector or right-click menu): that's ordinary editing, so it happens at once with a “Deleted ⟨name⟩” toast and Undo. Removing a step from a Routine (⌫ or right-click Delete) is ordinary editing too: at once, with a “Deleted ⟨step⟩” toast and Undo. Agent tools (`delete_parts`) don't ask.
13. **Toasts confirm in past tense** and name the thing, with Undo for destructive or bulk actions: “Deleted Cube” + [Undo], “Saved Robot Arm”, “Exported STL”. Not a bare “Saved” or “Done”, and never “successfully”.
14. **Footnotes and fine print:** one line, front-loaded, fragments are fine. A footnote that repeats the settings and numbers above it doesn't exist: under Printing, the ≈ on the time already says it's an estimate and Slice is right there.
15. **Numbers:**
    - Tabular figures, units in a muted suffix (`mm`, `°`, `%`).
    - Use `×` for sizes: `40 × 36 × 20`.
    - Use numerals, not words (“3 parts”), and pluralize correctly (“1 part”, “2 parts”). Every count in the app and the agent's text goes through `plural` (`electron/plural.mjs`, shared by the renderer, the main process and the MCP server: `plural(n, 'part')`, `plural(n, 'mesh', 'meshes')`), never a hand-written `n === 1` ternary or a bare `${n} parts`. The CAD kernel reads only its own folder, so its counts use drawing notation (“4× through hole”). Word a count so no verb has to agree with it: “No price on 2 lines”, not “2 lines have no price”.
    - Times and dates go through `src/utils/timeAgo.ts`, never a raw ISO date or a hand-built format. A list column uses `timeAgo` (“now”, “5m”, “2h”, “3d”, then “Nov 4”); a phrase uses `agoPhrase` (“Made just now”, “5m ago”); a date uses `dayLabel` (“Checked Nov 4”). Each adds the year only when it isn't this year (“Nov 4, 2025”). A printed document, read long after it's made, uses `fullDate` (“November 13, 2026”), which always has the year. A clock time uses `clockTime` (“Fault at 2:32 PM”), the same on every machine. Text a date can't be read from (an agent's price date before it was checked) shows as written. Date groups (Today, Yesterday, Previous 7 days, then the month) come from `groupByDate`.
    - Durations in the app and the agent's text go through `src/utils/duration.ts`, never a hand-built `${n} s`. A moment in a run or a running clock uses `runClock`, which keeps one decimal so it holds its width (“Fell at 2.0 s”); so does a span shown beside one, so the two match (a try's length, “0.4 s at limit”, an animation's length beside its scrub). A span uses `duration`: tenths of a second under a minute (“0.5 s”, “45 s”), then its two largest units with the second padded (“1 min 05 s”, “1 h 05 min”). An estimate rounds to the minute and never shows zero (`duration(s, 'min')`: “≈ 1 h 05 min”, “About 3 min left”). A value someone set shows as written, in seconds: a task contract's windows, a keyframe's time, a try's horizon and the limits that check them (“A try lasts 0.5 to 60 s.”), and a Routine step's wait, timeout and cooldown (“Wait 0.25 s”, then `duration` from a minute: “Walk for 5 min”). A span under a tenth of a second shows hundredths, so a positive span never reads “0 s” (“above stall for 0.03 s”). Sub-second engineering timings checked against a limit in milliseconds (a scenario step's elapsed time, a control gap) stay in whole ms, the unit their limit is written in.
    - A weight is labeled Weight in the app, never Mass (center of mass stays), and reads through `weight` (`src/utils/weight.ts`), never a hand-built `${n} g` or `${kg.toFixed(2)} kg`: tenths of a gram under 10 g (“0.4 g”) and hundredths under 0.05 g, so a positive weight never reads “0 g” (“0.02 g”), whole grams to a kilogram (“85 g”), then kilograms to three figures (“1.25 kg”, “35.2 kg”, “120 kg”). That holds for the Weight check, Explore and Compare, an object's card, plates and printed parts in Print mode, a servo's strength, and the agent's reports. A value someone wrote shows as written: a catalog part's or supply's weight, a payload set on a skill, and filament to buy in the bill of materials.
16. **No middle dots (`·`) between items, and no other separator glyph in their place** (a pipe, `•`, `—`). Separate facts with layout instead:
    - a meta line of facts: `MetaLine` (items 12px apart; `SectionHeader` and the part page and hover card subtitles take a list and use it);
    - a spec value with several facts: a list (`SpecValue`), rendered one per line by `SpecText`;
    - several shortcuts or settings: one row each (“Group ⌘G”, “Ungroup ⇧⌘G”), never “Group · Ungroup”;
    - one string (toasts, tooltips, labels): a plain sentence (“Inserted G1 with 23 joints”, “Connected to Claude”, “Printed TPU”).
    - Unit dots (`N·m`, `kg·cm`) are multiplication signs, not separators, and stay. In docs, “⟨text⟩” + [Action] notes a message with its button.
17. **Same word everywhere for the same thing:**
    - Parts are added, models are inserted, scenes are opened (in a tab) and closed, comments are posted, prices are added and checked.
    - Part types are **Solid / Cutout / Guide**.
    - One verb per action, in buttons, menu items, ⌘K, the app menu, confirmations, toasts and help articles. A toast uses its past tense (Deleted, Stopped). `basecase/copy` fails a label that starts with a synonym listed in [`tools/copy/glossary.mjs`](../../tools/copy/glossary.mjs) and names the word to use, so a new row goes there and here together. Train stays right elsewhere, so the Teach row needs a reader.

      | Action | Word | Not |
      |---|---|---|
      | Destroy something a person made (a mark, comment, price, scene, chat, pose, policy, Case, try, step…), one or all of them | Delete | Erase, Discard, Trash, Destroy; Remove or Clear before one of those things |
      | Take something out of a list or a draft without destroying it (an attachment, a quote) | Remove | Detach |
      | Empty a field, a drawing in progress or a state (a search, a sketch, a fault) | Clear | Wipe |
      | Halt something running (the sim, a try, driving, a print, training, the agent) | Stop | End (End effector and the End key stay), Halt, Abort, Terminate, Kill |
      | Open a scene, file, image or page | Open | View (a menu named View stays), See Inside |
      | Put away a tab, window, sheet or Case | Close | Dismiss |
      | Bring a panel, view or layer into sight; Hide puts it away | Show | Reveal, Toggle |
      | Make a second one beside the first | Duplicate | Clone |
      | Start a Case, Routine, Checks or a policy | Run | Launch, Execute |
      | Put a part in the scene | Add | Insert Part |
      | Put a model or robot in the scene | Insert | Add Model, Add Robot |
      | Bring a new build guide, Case or Routine into being | Make | Create, Generate |
      | Make an out-of-date build guide again | Update | Regenerate |
      | Describe a new skill for the agent to train; Train runs training on a skill row | Teach | — |
    - A duplicate is named the way Finder names one: “Bracket copy”, then “Bracket copy 2”, skipping names already taken, through `copyName` (`src/workspace/helpers.ts`). That holds for a part, a group, a scene or tab, and a Library model; a pasted part keeps its name, and several duplicated parts keep theirs while their group is renamed.
18. **Icon-first.** Our own icons (`src/design-system`, §14) with custom tooltips (the `Tooltip` primitive), never native `title` on buttons. There's no third-party icon set.
    - When the library has nothing that reads clearly, draw a new icon with the `icon-design` skill (`.agents/skills/icon-design/SKILL.md`): 24 grid, 2px round strokes, an outline/filled pair for anything that toggles, previewed beside its neighbors before shipping.
19. **No status dots** unless they report an error or a live background process. The agent panel shows connection state only when disconnected. A tab's dot is its `status` in `PanelTabs`, whose only tones are `live` (blue) and `problem` (red), named in the app's own tooltip: the Build tab shows red while something is left to fix and nothing once it's Ready to build.
20. **American English**, as macOS and the menus spell it: center, color, gray, meter, catalog, behavior, modeled, labeled, canceled. That holds in the app, the agent's prompt and tool text, part notes, errors, and the help center, changelog and blog. `basecase/copy` fails a British spelling listed in [`tools/copy/spelling.mjs`](../../tools/copy/spelling.mjs) in a user-facing string, and `check:site` fails one in a page's title or text (code spans aside), so a new one goes there. Ids that already ship keep theirs (the `robot.travelled` signal, a print's `cancelled` state), and so do search keywords that catch British spellers (a help page's `keywords`, ⌘K's).
21. **Apostrophes are ’**: “can’t”, “the robot’s”, never a straight `'`. That holds for every string a person reads in the app, its errors and part notes included; the agent's prompt and tool descriptions, which only the agent reads, may keep `'`. `basecase/copy` fails a straight apostrophe between letters in a user-facing string ([`tools/copy/apostrophe.mjs`](../../tools/copy/apostrophe.mjs)). Help center, changelog and blog pages are written with `'`, and the site sets it as ’ in titles and text when it reads them (`typesetMarkdown` in `src/landing/pages/typeset.ts`, code aside), so search finds a title typed either way.

### 3c. Words and patterns to avoid

One list holds the banned words and separators: `BANNED_COPY` in [`verify/rehearsal/uiRules.ts`](../../verify/rehearsal/uiRules.ts), which the copy budget below, the Stage 7 rehearsal's screen scan and the lint all read. `basecase/copy` (`tools/eslint/copy.mjs`) lints the entries that [`tools/copy/banned.mjs`](../../tools/copy/banned.mjs) gives a fix, in JSX text, toasts and confirms in `src/` and the app menu, and in the props and properties listed in [`tools/copy/surfaces.mjs`](../../tools/copy/surfaces.mjs) (`label`, `title`, `placeholder`, `aria-label`, `alt`, `heading`, `message`…). The list is under `verify/`, so a new word needs a maintainer's OK (§0k); give it a fix in `tools/copy/banned.mjs` to lint it too. The same rule fails a label that starts with a synonym from the glossary (§3b-17, `tools/copy/glossary.mjs`), which lives under `tools/` and needs no OK beyond this guide. “just”, “We”, “Your”, “!” and the rest of the table still need a reader.

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
- **Mailchimp:** password rules that gray out one by one as you meet them, instead of an error after you submit. Prevent the error, and give feedback in place.
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

### 3f. Changelog, blog and help center

The rules for long-form copy on basecase.so: `site/content/changelog/`, `site/content/blog/` and `site/content/help/` (Loop, §0l, has the folders and front matter). §3a–§3c hold here too, with three changes: posts may say “we” (below), a changelog entry may open with “You can now”, and UI labels quoted in prose keep their app casing. Each rule cites the research behind it: **B** is [Blogs and changelogs](../research/Writing/blogs-and-changelogs.md) (B1–B9 are its “What the best ones share”, B-gap its “Where Basecase falls short”), **G** is [Writing guides](../research/Writing/writing-guides.md) (G1–G27 are its synthesis rules). Rules marked **(checked)** fail `npm run check:site`; review fails a page that breaks any of the rest.

#### Every page

1. **The first sentence is the news or the task**: what the reader can do now, or what the page helps them do. Never a definition (“A Case is…”), “Until now”, or a menu label as the subject (“Calibrate Servos moves…”); the person or the problem comes first, where it lives second. (B1, B-gap 2, G1)
2. **Sentences of 25 words or fewer, paragraphs of 5 sentences or fewer** (checked in changelog and blog). Vary the rhythm: a run of equal sentences reads generated; a short one turns the point. (G2, B7)
3. **One claim per sentence.** The fact, its reason and its limit each get their own; never three clauses joined by commas and “and”. Never inventory the UI in one breath (“X, next to Y in Z and in ⌘K, sends…”). (B-gap 1)
4. **The why is one concrete case**, next to the what: the person, the input or the failure that made it worth building (“a template Case published from a second scene replaced the first scene's dataset”). Never a mission statement. (B2, B-gap 3)
5. **Real numbers, true in the code or measured.** Durations, sizes, limits, counts, versions: “18 seconds”, “200 MB”, “25 frames a second”. Where nothing was measured, give no number and no comparative (“faster”, “smaller”). (B3, B-gap 4)
6. **Show the real thing**: a screenshot of each state, a real link, file name or output. Alt text says what's on screen, never “screenshot” (checked). Every image the page names exists in `site/public/` (checked). (B4, G22)
7. **Limits get their own plain sentence**: in the first paragraph when they decide whether the page is for you (desktop only, emulated only), otherwise before the ending (public repos only, what isn't in it). Never an adjective mid-sentence, the last line, or “experimental”. (B5, B-gap 6)
8. **Plain words.** Keep the terms experts search for (URDF, MJCF, LeRobot) and explain or link each the first time on a page. (G3)
9. **Describe, don't sell** (checked), in American English (checked, §3b-20): no “powerful”, “seamless”, “effortless”, “game-changing”, “revolutionary”, “magic”, “cutting-edge”, “supercharge”, “excited to”, “Try it today” and the rest of `SITE_BANNED` in `tools/site/banned.mjs`, which also holds §3c's please, simply, just, easily, successfully, Oops and Invalid. (G4, G7, B “specific nouns”)
10. **Link text names the destination** (checked): never “here”, “click here”, “more”, “Learn more”, “Read more”. Link at the point the link helps, not in a closing list. Every link to `/help/`, `/changelog/` or `/blog/` resolves (checked). (G6)
11. **Titles**: sentence case, 65 characters or fewer, no closing `.`, `?`, `!` or `:` (checked). Unique across the site, and true without the page around them. (G17, G5)
12. **The first paragraph is the summary.** Lists, feeds and the meta description show it alone, so it stands alone and doesn't repeat the title. (G19, G9)
13. **End on something the reader can use**: the help article, the next step, what's coming without a promise. Never a slogan, “Try it”, or a precondition (“…once the scene has a movable joint.”). (B9, B-gap 11)
14. **Voice.** A changelog entry or post may say “we” for the people who build Basecase, once Basecase is named, and speak first-hand: what was hard, what we chose and why, what we got wrong. Help says “you” only. No jokes about failure, no exclamation marks. (B6, G15, G “Humor and warmth”)
15. **Never write**: “Updated…”, “Improved…”, “Various fixes”, “In today's…”, “Whether you're a… or a…”, “We're excited to announce”, headings like “Introduction” or “Overview”, or a claim you didn't check in the code. (B “templated scaffolding”, G9)

#### Changelog entry

- **When.** Only when a person can do something new, or must know something new: a new capability, a new way of working, or a real change in behavior. Never for a fix, polish, a rename, a moved control, one more option or a faster load; the release notes list those. Two features are two entries; several steps of one arc are one entry, written by the step that makes it usable. Same feature again: update its entry. (G8, B-gap 7)
- **Title**: what you can now do, in the feature's words, a few words long (“Calibrate servos”). (B “Linear changelog”)
- **First paragraph**: one or two sentences (checked), usually “You can now…” or the problem it solves. (B “Linear changelog”, G9)
- **Length**: 60 to 250 words. Up to 500 only when the entry carries news a help article can't: a decision, a cost, a reversal. `##` headings only past 250 words. (B “Linear changelog”, B “Amp's Chronicle”)
- **Order**: what you can do and where → the one case that's why → how it behaves, with numbers → limits → the help link.
- **No steps.** Steps belong in the help article; an entry that walks the UI section by section is a manual. (B-gap 9)
- **Images**: `image:` is a cover screenshot of the feature in use whenever it has a screen; add a body image only for a state the cover doesn't show. Images live in `site/public/changelog/<file name without the date>/`. An entry with nothing on screen (a release, a file format) has none. (B4, B-gap 5)
- **The help link**: from 2026-11-12, when the help center opened, every entry links its help article by its title (checked), usually in the last sentence: “Steps are in Calibrate an emulated robot.”, with the title as the link text to `/help/calibrate-an-emulated-robot` (G10, B-gap 11)
- `version:` when it shipped in a release.

#### Launch blog post

- **When**: only for an arc's big step (a new integration, a new app, a rebuilt subsystem), and only when there's a story the changelog can't hold: a decision, the alternatives, a cost, a number. Otherwise the changelog entry is enough. (B-gap 10)
- **Not the changelog again**: link the entry and the help article; never copy their sentences (checked: a sentence of 8 words or more that also appears in a changelog entry fails). (B-gap 10)
- **Structure**: the news and who it's for in the first paragraph → the problem as one concrete case → each choice with the alternative it beat and why → numbers → limits and what's next → the help article. (G12, G13, B1–B5)
- **Length**: 400 to 1,500 words, under `##` headings that name what's below them, front-loaded and parallel. (G14, B8)
- **Admit the cost.** Every post says at least one thing that's worse, missing or reversed. (B5, B “Admissions”)

#### Help article

- **One type per article** (Diátaxis): a **task** (how to do one thing), a **tutorial** (a first project that always works), a **concept** (why and how something works), a **reference** (everything of one kind: shortcuts, formats, the files in a package) or **troubleshooting** (one problem, from its symptom). A task holds action only and links the concept for the why; a list of a zip's files is reference. No FAQ pages. (G16, G24, G “FAQs”)
- **Titles by type**: a task starts with its verb and names the goal, not the tool (“Import a mesh”), never “How to…” or an “-ing” word (checked); a concept is a noun phrase that reads after “About” (“Checks and blockers”); a reference names what it lists (“Keyboard shortcuts”); troubleshooting states the symptom (“Agent shows Sign In after connecting”). No questions (checked), no content type (“guide”, “FAQ”). (G17)
- **Summary**: the first paragraph, one sentence, 160 characters or fewer, ending in a full stop and adding words the title lacks. (G19)
- **Steps**: numbered, one action each, where before what (“In Results, click **Publish to Hugging Face**.”), full sentences ending in a full stop, ten at most, the last one finishing the task. Alternatives (⌘K, a drop on the canvas) go after the steps in one line, never inside a step. (G20)
- **UI labels are bold and spelled as in the app**, Title Case kept, trailing ellipsis dropped; each label in a menu path is bold (**File** ▸ **Import Robot**). Keys are not bold (⌘K). Verbs: click, right-click, press, drag, and choose for menu items. (G21, G “Click or select”)
- **Requirements say “must”, options “can”.** A warning about real hardware comes before its step and says “do not”. (G26)
- **Screenshots** follow the step they show, cropped to the action, in `site/public/help/<slug>/`. The steps work without them. (G22)
- **Links**: the concept from the task, the next task from the last step. End with at most two related articles: one simpler, one more advanced. Every article is linked from another article or its collection. (G25)
- **Collections follow the robotics loop**, not the code: Get started, Design, Engineer, Simulate and train, Build and print, Operate, Fix a problem. Each article sits in one. (G23)
- `covers` lists the code the article describes; recheck the article when that code changes.

**Before → after** (`2026-11-12-calibrate-servos.md`):

| Before | After |
|---|---|
| “Calibrate Servos moves each joint of a connected emulated robot through a slow bench run and fits its servo, so the Simulate tab, Cases and training run on the fit.” (30 words, a menu label as subject, the limit hidden in “emulated”) | “You can now fit each servo's model from an 18-second bench run, so simulation moves the way your servos do. It works on the emulated robot; real servos stay locked.” |

**What `npm run check:site` checks** (`tools/check-site.mjs`, logic in `tools/site/`; part of `npm run check`, and `check:changed` runs it when a file under `site/` changes): sentence and paragraph length and a changelog's first paragraph (changelog and blog); banned and marketing words, link text, links to site pages, image files and alt text, and title length and punctuation (every page); the help link (changelog from 2026-11-12); copied changelog sentences (blog); question, “How to” and “-ing” titles (help).
