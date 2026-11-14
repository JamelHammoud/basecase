# Fix ghost errors resulting from out-of-order type checking

This PR introduces logic that suppresses ghost errors resulting from "inverted" type checking situations where, for example, an API client asks for the type of a symbol in the middle of a section of code, causing type resolution to occur in a different order than when the code is checked from top to bottom in a regular compilation.

Some context on the fix in this PR. In this example

```ts
function builder(def: IThing) {
  return def;
}

interface IThing {
  doThing: (args: { value: object }) => string
  args: { value: number }
}

builder({
  doThing(args: { value: object }) {
    const { value } = this.args;  // Ghost circularity error on "value"
    return `${value}`
  },
  args: { value: 42 }
});
```

a circularity error is reported in the VS Code IDE, but no error is reported with the command-line compiler. The issue is that the IDE language service requests type information on identifiers in the code (likely for semantic classification, but doesn't really matter) _before_ it requests the full list of diagnostics for the code. Specifically, a request is initially made for `getTypeOfSymbol` for the symbol of the `value` identifier. This causes resolution of `this.args`, and to resolve the type of `this`, a request is made for the contextual type of the object literal passed as an argument in the `builder({...})` call. That in turn means we need to resolve the signature for the call, which in turn means resolving the type of the arguments, which in turn means obtaining the type of the `{...}` object literal argument, which further requires resolving the return type of `doThing`, which gets us back to a second `getTypeOfSymbol` call for `value`. And we have a circularity.

However, in the regular top-to-bottom sweep to produce diagnostics, we request resolving the signature of the `builder({...})` call first, which eventually gets us to a `getTypeOfSymbol` for `value`, which in turn requests the contextual type for the object literal. We then see that we're in the process of resolving the signature of the containing `builder({...})` call, and therefore we simply report that there is no contextual type. And thus no circularity.

With the fix in this PR, we temporarily reset the resolution stack during `getResolvedSignature` calls. In the IDE scenario this means that the first call to `getTypeOfSymbol` is no longer reflected on the resolution stack, so resolution can proceed in the same manner as the regular case. Following that, the outer `getTypeOfSymbol` call notices that a resolved type has already been recorded, so it simply proceeds with that. No circularity, and all is well.

Fixes #57429.
Fixes #57585.
