# terminal: prompt redraw on resize no longer leaves stale prompts

Fixes #13629
Fixes #14751
Supersedes #14707

When a resize changes the column count and the shell redraws its prompt (OSC 133), we previously could leave stale prompt rows behind. Each resize  added another copy, and this caused issues most visibly with prmpts that used the whole line, like powerlevel10k.

Two separate bugs here.

(1) Reflow copied a row's semantic prompt mark onto every row it split  the row into, and a joined row took the mark of the last row joined into it. 

(2) We clear the prompt after the reflow, so the clear looked for the prompt start using those wrong marks. Narrowing cleared from a later start and left the top of the prompt behind. Widening walked past the missing start and also cleared the previous prompt.

Reflow now marks only the first row of a prompt as the prompt start, the same as if the prompt were printed at the new width. This also fixes jump to prompt and other prompt features for older prompts in scrollback.

For the redraw, we now find the prompt start before the resize and track it with a pin. Column reflow writes the prompt rows as blank rows that each end their line (`PageList.Resize.blank`), so the prompt keeps the row count it had at the old width. That matters because after SIGWINCH, zsh moves the cursor up by the number of rows the prompt took at the old width and then redraws. We clear from the pin after the resize, so a failed resize still leaves the prompt untouched.
