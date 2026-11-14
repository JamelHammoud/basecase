# Suggestion: Noninferential type parameter usage

We keep getting bugs like this and I keep not finding the original so I'm making a new one so we can find it.

Keywords: ignore type parameter optional inference

### Problem

Often with generics, there will be some locations where a type parameter *should* be inferrable from usage, and *other* places where the type parameter should only be used to *enforce* typechecking. This comes up in a variety of contexts

```ts
class Animal { move }
class Dog extends Animal { woof }

function doSomething<T>(value: T, getDefault: () => T) { }
// Wanted an error here - getDefault() ought to return same type as 'value'
doSomething(new Dog(), () => new Animal());
```

```ts
declare function assertEqual<T>(actual: T, expected: T): boolean;
const g = { x: 3, y: 2 };
assertEqual(g, { x: 3 }); // Forgot y, wanted error
```

### Proposal Sketch

We should be able to mark type parameter consumption sites as being "not eligible for inference". For example, let's say we had a special global type that the compiler knew not to unwrap during inference:
```ts
type NoInfer<T> = T;
```
Then we can annotate usage sites
```ts
function doSomething<T>(value: T, getDefault: () => NoInfer<T>) { }
// Wanted an error here - getDefault() ought to return same type as 'value'
doSomething(new Dog(), () => new Animal());
```
```ts
declare function assertEqual<T>(actual: T, expected: NoInfer<T>): boolean;
const g = { x: 3, y: 2 };
assertEqual(g, { x: 3 }); // Error
```
