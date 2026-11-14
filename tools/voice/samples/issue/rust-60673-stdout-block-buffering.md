# io::Stdout should use block bufferring when appropriate

I feel like a pretty common pitfall for beginning Rust programmers is to try writing a program that uses `println!` to print a lot of lines, compare its performance to a similar program written in Python, and be (rightly) baffled at the fact that Python is substantially faster. This occurred most recently here: https://www.reddit.com/r/rust/comments/bl7j7j/hey_rustaceans_got_an_easy_question_ask_here/emx3bhm/

The reason why this happens is because `io::Stdout` unconditionally uses line buffering, regardless of whether it's being used interactively (e.g., printing to a console or a tty) or whether it's printing to a file. So if you print a lot of lines, you end up calling the `write` syscall for every line, which is quite expensive. In contrast, Python uses line buffering when printing interactively, and standard block bufferring otherwise. You can see more details on this [here](https://github.com/python/cpython/blob/6daaf3f7de78eec2c80eaa8e94e4cca54f758a30/Modules/_io/_iomodule.c#L163-L173) and [here](https://docs.python.org/3/library/sys.html#sys.stdout).

In my opinion, Rust should adopt the same policy as Python. Indeed, there is even a FIXME item for this in the code:

https://github.com/rust-lang/rust/blob/ef01f29964df207f181bd5bcf236e41372a17273/src/libstd/io/stdio.rs#L401-L404

I think this would potentially solve a fairly large stumbling block that folks run into. The CLI working group [even calls it out as a performance footgun](https://rust-lang-nursery.github.io/cli-wg/tutorial/output.html#a-note-on-printing-performance). And also [here](https://github.com/rust-lang-nursery/cli-wg/issues/29) too. Additionally, [ripgrep rolls its own handling for this](https://docs.rs/grep-cli/0.1.2/grep_cli/fn.stdout.html).

I can't think of too many appreciable downsides to doing this. It is a change in behavior. For example, if you wrote a Rust program today that printed to `io::Stdout`, and the user redirected the output to a file, then the user could (for example) `tail` that output and see it updated as each line was printed. If we made `io::Stdout` use block buffering when printing to a file like this, then that behavior would change. (This is the reasoning for flags like `--line-buffered` on `grep`.)

cc @rust-lang/libs
