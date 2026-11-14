# Native Git support in Zed

We've heard for a long time that many of you want to be able to use Git from within Zed. Not necessarily for everything, but particularly for the 90% "git-commit", "git-push" workflow, it's just too slow to have to context switch every time.

I'm excited to announce that, today, Git support is now available starting from Zed v0.177!

## An Overview

We wanted to build a Git integration with three priorities:
- Speed: using Git from within Zed should feel faster than using the command line.
- Git native: we're not reinventing the wheel, just giving you first-class access to the Git features you already know.
- Keyboard first: you're limited by the speed of your fingers, not your elbows.

The new Git Panel gives you a bird's-eye view of the state of your working tree and of Git's staging area. You can see at a glance which files have changed, and which are staged for commit. Using your keyboard you can stage changes, or restore the files to their state in HEAD. We monitor the repository so that changes you make on the command line are instantly reflected in Zed.

When you're ready, you can commit with cmd-enter, and, because it's 2025, Zed can ask your preferred LLM to write the message for you. Another neat touch: when you're collaborating with your team, Zed will automatically add Co-Authored-By lines, so you have one fewer thing to do.

When you want to zoom in, use the Diff View to review your commit line by line. Just like git add -p you can stage or skip hunks with the keyboard. But, because Zed is a text editor, you can also make last minute changes to your files as you go (no one else needs to see that dbg!).

That said, my favorite Git feature in Zed is that you can always run git::Commit from the command palette without staging and it will commit all changes to tracked files. Just like git commit -a. This makes it easy to quickly save whatever you're working on to a branch.

The final pieces that we have in place today are fetch, pull, and push. These are accessible through the command palette from anywhere in the app. And when you focus the Git Panel you can use the shortcuts.

## Under The Hood

We had to rebuild the text buffer in Zed to make sure that diffs shown in the editor just work. Now, deleted text shows up just like any other text (though with a deleted background) so that you can select, copy-paste, and move through with the text cursor, no mouse needed.

Although this sounds straightforward, our original implementation for deleted hunks was entirely external to the Editor's coordinate system. We even rendered the text as "blocks" inserted between lines in the Editor's data structures. But as of this huge, 240 commit PR, deleted hunks are an ordinary part of the Editor's coordinate system, enabling all kinds of inter-hunk functionality like text search and editor::SelectAllMatches in deleted hunks.

Showing whether or not a diff hunk has been staged was another fun challenge. Most Git clients show you staged and unstaged changes in different sections of the UI. This is definitely easier to implement, but it makes it awkward to stage and unstage with the keyboard because staging a hunk causes it to move, and so your focus is lost. We chose to interleave both staged and unstaged hunks together in what we affectionately call the "diff-of-diffs". First, we look at the diff between the editor contents and HEAD to know which diff hunks to show. Secondly, we calculate the diff between the staging area and HEAD. Only by looking at the difference of those two diffs can we tell which hunks are staged, and which are not.

Figuring out how to render all of this in an intuitive and consistent way was another problem that we were fixing all the way up until the Friday before this launch.

We think you'll enjoy where we've landed in the tradeoff space, but all of this plumbing has been designed with future features in mind. We want to show you the traditional staged and unstaged diffs, the diff from main, and even the diff between any commit and its parents. All of these are technically possible (though we haven't implemented them yet :D).

## What's Next

Our goal with this project was to set the standard for what Git in Zed looks like: fast, easy to use, and well integrated with existing tools and workflows. However, there's a lot of ground to cover and we plan to bring more Git capabilities into the editor soon. In particular:
- Conflict resolution. This is probably one of the most confusing states possible in Git and we can do a lot to make it more intuitive.
- Line by line staging. Right now the smallest unit of staging is a contiguous group of lines. We want you to be able to stage individual lines, just like you can in other tools.
- History visualization. We have space for this at the bottom of the Git Panel, we'd like to show recent commits and let you see their diffs.
- And more… Let us know what you want either in Discord, or in a GitHub discussion.

So, please try out the new Git support. File issues if you run into them, and help us figure out what to build next!
