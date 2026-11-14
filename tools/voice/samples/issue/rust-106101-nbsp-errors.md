# Too many errors on non-breaking space characters in source code

Rustc emits a separate error for every single time U+00A0 appears in the source file.

_(See #106098 for how someone might very reasonably end up with non-breaking space characters in their source code. Even if that issue gets resolved in rustdoc, I still think rustc's parser needs to handle this better, because non-breaking spaces might be copied in from some other website, or from documentation rendered by older versions of rustdoc.)_

My preferred behavior would be that rustc should emit just a single error on the **first** non-breaking space in the entire file. Then silently interpret every subsequent non-breaking space in the file as an ordinary space.

If that is too tricky, a more conservative change that would still be an improvement would be to emit a single error for a consecutive sequence of non-breaking space characters (i.e. this would typically result in one error per line, instead of one error per space).

### Repro:

```console
$ echo -e '\u00a0\u00a0\u00a0\u00a0fn main() {}' | rustc /dev/stdin -o a.out
error: unknown start of token: \u{a0}
 --> /dev/stdin:1:1
  |
1 |     fn main() {}
  | ^
  |
help: Unicode character ' ' (No-Break Space) looks like ' ' (Space), but it is not
  |
1 |     fn main() {}
  | +

error: unknown start of token: \u{a0}
 --> /dev/stdin:1:2
  |
1 |     fn main() {}
  |  ^
  |
help: Unicode character ' ' (No-Break Space) looks like ' ' (Space), but it is not
  |
1 |     fn main() {}
  |  +

error: unknown start of token: \u{a0}
 --> /dev/stdin:1:3
  |
1 |     fn main() {}
  |   ^
  |
help: Unicode character ' ' (No-Break Space) looks like ' ' (Space), but it is not
  |
1 |     fn main() {}
  |   +

error: unknown start of token: \u{a0}
 --> /dev/stdin:1:4
  |
1 |     fn main() {}
  |    ^
  |
help: Unicode character ' ' (No-Break Space) looks like ' ' (Space), but it is not
  |
1 |     fn main() {}
  |    +

error: aborting due to 4 previous errors
```
