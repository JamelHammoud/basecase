# Raycast for Mac v2.12

November 13, 2026

A brand new Calculator. We rebuilt the calculator from scratch. It’s 60x faster and uses 65% less memory, and it understands a lot more. You can ask about the weather, track flights, look up any place and use many more units, functions and phrases. Learn more about the new Calculator on the Raycast Manual.

## New
- Calculator (Weather): Ask with weather in Paris, weather tomorrow, weather in 4 hours or London feels like, and use the values in calculations, like temperature in Paris in fahrenheit
- Calculator (Flights): Track a flight by its number, like flight BA117
- Calculator (Travel Times): Get travel times with time to Paris by car or walking time between SF and NYC
- Calculator (Places): Look up any place by name, not just major cities, like time in Chamonix or distance from Chamonix to Paris
- Calculator (Dates & Time): Week numbers (week 44 2026), time left (days left in this month, hours left in today), days since march, time zone abbreviations (4:00 PT in UTC) and clock math in other places (time in Brisbane + 4)
- Calculator (Functions): e, round(23.456, 1), function-style lists like sum(1, 2, 3) or max(2 hours 30 min, 200 min), rounding to steps (3.3 to nearest quarter), fractions (1.75 as improper) and any base up to 36
- Calculator (Money): Tips, tax and VAT (15% tip on $80, 20% vat in 120) and bill splitting (25% off $60 split 3)
- Calculator (Units): Dozens of new units, physical constants (speed of light in km/s), chemistry (molar mass of C6H12O6), running pace (5:00 min/km in km/h), download times (transfer 1 TB at 100 Mbps), musical notes (c4 to hz) and text functions (first 10 characters of "hello")
- Contacts: Added a Create Contact command and action
- Dictation: We’ve added a new experimental microphone warming setting to the dictation microphone settings. This lets you keep your mic warm using one of several options to help with the cold start of Bluetooth devices.
- Organizations: Copy an organization's invite link straight from Settings → Organizations with the new Copy Invite Link button
- Settings: Extensions in the sidebar now have Disable and Manage actions in their context menu

## Improvements
- AI (Browser Tools): Browser tools now work across several connected browsers, so AI reads and manages tabs in the right one
- AI (Browser Pairing): Raycast AI now pairs with your browser using a one-time code before it reads your history or bookmarks. You can see and forget paired browsers in Settings → Browser.
- AI (Attachments): Updated design when dragging files into a chat
- AI (Chat): Faster loading of chats with code blocks, math and markdown
- Applications: Quit and Hide actions only show when the app is running
- Calculator: Improved accuracy. Discounts always subtract, tips always add, 15% decrease from 813 subtracts, unit conversions use exact factors, and negative times and lengths keep their sign.
- Dictation: Background audio options now include pausing and lowering audio, instead of solely just muting it.
- Focus: Pause and Resume Focus Session can now be added to Favorites
- Focus, Keep Awake & Calendar: Duration fields understand more inputs, like 45m, 1:30, until 3pm or by friday
- Memory Usage: Reduced memory usage under the hood by about 25%.
- Open Camera: Remembers the camera you last selected
- Organizations: Copy Organization Invite Link lets you pick the organization when you're in several, and explains when a link can't be copied, like when SSO manages your members or you're not a manager
- Root Search: When entering text in a field directly in the action panel (like setting an alias, renaming a clipboard entry/file, etc), we now shake the window when attempting to submit an empty value
- Search Arguments (Design): Refreshed design with the command icon and larger fields and fonts, and better use of space so you can see more of your inputs
- Search Arguments (Errors): Errors now only show when you submit
- Search Arguments (Placeholders): The command name now shows as a placeholder next to arguments in every view that uses them, like Search Quicklinks, Snippets, Scripts and AI Commands
- System: Raycast does less background work while your Mac is asleep
- Window Management: Applying a layout now moves windows to the current Space and positions full-screen apps correctly

## Fixes
- AI: Fixed MCP servers you stopped while they were connecting starting again
- AI Chat: Fixed sidebar rows appearing in incorrect positions and chats not restoring correctly after unarchiving
- AI Usage: Fixed menu bar usage colors and appearance updates when switching between light and dark mode
- Account: Fixed a sign-in or sign-out sometimes being undone by a background refresh
- Applications: Fixed localized app names showing in English and not being searchable
- Applications: Fixed apps not being found by their keywords
- Calculator: Fixed the time in another time zone showing your local date instead of that place’s date
- Clipboard History: Fixed an issue where the “Paste Sequentially” command wouldn’t retain all representations, thus sometimes dropping links
- Clipboard History: Fixed pastes into browsers sometimes inserting nothing or the previous clipboard contents
- Clipboard History: Fixed copies from Edge web apps ignoring per-app exclusions
- Clipboard History: Fixed small images pasting as TIFF instead of PNG
- Clipboard History: Fixed consecutive screenshots from apps like Monosnap merging into one entry
