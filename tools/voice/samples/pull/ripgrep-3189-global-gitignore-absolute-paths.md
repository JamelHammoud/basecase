# ignore: fix global gitignore bug that arises with absolute paths

The `ignore` crate currently handles two different kinds of "global"
gitignore files: gitignores from `~/.gitconfig`'s `core.excludesFile`
and gitignores passed in via `WalkBuilder::add_ignore` (corresponding to
ripgrep's `--ignore-file` flag).

In contrast to any other kind of gitignore file, these gitignore files
should have their patterns interpreted relative to the current working
directory. (Arguably there are other choices we could make here, e.g.,
based on the paths given. But the `ignore` infrastructure can't handle
that, and it's not clearly correct to me.) Normally, a gitignore file
has its patterns interpreted relative to where the gitignore file is.
This relative interpretation matters for patterns like `/foo`, which are
anchored to _some_ directory.

Previously, we would generally get the global gitignores correct because
it's most common to use ripgrep without providing a path. Thus, it
searches the current working directory. In this case, no stripping of
the paths is needed in order for the gitignore patterns to be applied
directly.

But if one provides an absolute path (or something else) to ripgrep to
search, the paths aren't stripped correctly. Indeed, in the core, I had
just given up and not provided a "root" path to these global gitignores.
So it had no hope of getting this correct.

We fix this assigning the CWD to the `Gitignore` values created from
global gitignore files. This was a painful thing to do because we'd
ideally:

1. Call `std::env::current_dir()` at most once for each traversal.
2. Provide a way to avoid the library calling `std::env::current_dir()`
   at all. (Since this is global process state and folks might want to
   set it to different values for $reasons.)

The `ignore` crate's internals are a total mess. But I think I've
addressed the above 2 points in a semver compatible manner.

Fixes #3179
