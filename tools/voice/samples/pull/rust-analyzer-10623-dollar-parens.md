# internal: replace L_DOLLAR/R_DOLLAR with parenthesis hack

The general problem we are dealing with here is this:

```
macro_rules! thrice {
    ($e:expr) => { $e * 3}
}

fn main() {
    let x = thrice!(1 + 2);
}
```

we really want this to print 9 rather than 7.

The way rustc solves this is rather ad-hoc. In rustc, token trees are
allowed to include whole AST fragments, so 1+2 is passed through macro
expansion as a single unit. This is a significant violation of token
tree model.

In rust-analyzer, we intended to handle this in a more elegant way,
using token trees with "invisible" delimiters. The idea was is that we
introduce a new kind of parenthesis, "left $"/"right $", and let the
parser intelligently handle this.

The idea was inspired by the relevant comment in the proc_macro crate:

https://doc.rust-lang.org/stable/proc_macro/enum.Delimiter.html#variant.None

> An implicit delimiter, that may, for example, appear around tokens
> coming from a “macro variable” $var. It is important to preserve
> operator priorities in cases like $var * 3 where $var is 1 + 2.
> Implicit delimiters might not survive roundtrip of a token stream
> through a string.

Now that we are older and wiser, we conclude that the idea doesn't work.

_First_, the comment in the proc-macro crate is wishful thinking. Rustc
currently completely ignores none delimiters. It solves the (1 + 2) * 3
problem by having magical token trees which can't be duplicated:

* https://rust-lang.zulipchat.com/#narrow/stream/185405-t-compiler.2Frust-analyzer/topic/TIL.20that.20token.20streams.20are.20magic
* https://rust-lang.zulipchat.com/#narrow/stream/131828-t-compiler/topic/Handling.20of.20Delimiter.3A.3ANone.20by.20the.20parser

_Second_, it's not like our implementation in rust-analyzer works. We
special-case expressions (as opposed to treating all kinds of $var
captures the same) and we don't know how parser error recovery should
work with these dollar-parenthesis.

So, in this PR we simplify the whole thing away by not pretending that
we are doing something proper and instead just explicitly special-casing
expressions by wrapping them into real `()`.

In the future, to maintain bug-parity with `rustc` what we are going to
do is probably adding an explicit `CAPTURED_EXPR` *token* which we can
explicitly account for in the parser.

If/when rustc starts handling delimiter=none properly, we'll port that
logic as well, in addition to special handling.
