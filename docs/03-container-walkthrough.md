# Part 3: Container walkthrough

> A slow, step-by-step trace of [src/framework/module-scope.ts](../src/framework/module-scope.ts).
> These are the explanations that made things "click" while studying.
> Read [Part 1](./01-code-review.md) first.

## Contents

1. [Recipe vs box vs instance](#1-recipe-vs-box-vs-instance)
2. [Static vs dynamic: class vs plain object](#2-static-vs-dynamic-class-vs-plain-object)
3. [Same content is not the same object](#3-same-content-is-not-the-same-object)
4. [The two notebooks (`Map` and `WeakMap`)](#4-the-two-notebooks)
5. [`compile`: building and linking the boxes](#5-compile-building-and-linking-the-boxes)
6. [Merging class metadata with `register()`](#6-merging-class-metadata-with-register)
7. [`init`: filling the boxes](#7-init-filling-the-boxes)
8. [Before and after `init`](#8-before-and-after-init)
9. [Small JavaScript details](#9-small-javascript-details)

---

## 1. Recipe vs box vs instance

The word "module" hides **three different things**. Keeping them apart is
the key to this whole file.

| | What it is | Example | Created by |
|---|---|---|---|
| 🧾 **Recipe** | The description you write | the class `MatchModule`, or the object returned by `register()` | you |
| 📦 **Box** | `ModuleScope`, the container's internal record | `module #2` in the logs | `compile` |
| 🍰 **Instance** | The result of `new` on your module class or providers | `new MatchModule()`, `MatchService #1` | `init` |

After bootstrap there are **7 boxes** and, inside them, **7 module class
instances** (one per box) plus the providers:

| Box | Module instance created inside it |
|---|---|
| #1 | `new AppModule()` |
| #2 | `new MatchModule()` |
| #3 | `new ScoreboardModule()` |
| #4 | `new ConfigModule()` (app.storage) |
| #5 | `new ConfigModule()` (app.scoreboard.write) |
| #6 | `new ConfigModule()` (app.scoreboard) |
| #7 | `new LeaderboardModule()` |

That is 5 different classes and 7 instances, because `ConfigModule` shows up
three times (once per `forFeature`).

---

## 2. Static vs dynamic: class vs plain object

```ts
imports: [MatchModule]        // a CLASS        → typeof === "function"
imports: [sharedScoreboard]   // a PLAIN OBJECT → typeof === "object"
```

That is the test on [module-scope.ts:129](../src/framework/module-scope.ts#L129).
Classes are functions in JavaScript, so `typeof` separates the two cases.

**`register()` returns a plain object, not an instance.** Nobody calls
`new ScoreboardModule()` there:

```ts
return {                        // ← { } literal
  module: ScoreboardModule,     // ← the CLASS travels inside it
  imports: [...], providers: [...], exports: [...],
};
```

```ts
sharedScoreboard instanceof ScoreboardModule  // false
sharedScoreboard.module === ScoreboardModule  // true
```

Think of it as an **envelope** 📨: inside are the class and some extra notes
(imports, providers, exports). The container opens the envelope:

| Piece of the envelope | Used as |
|---|---|
| the whole object | the **cache key** (to recognize "I already built this one") |
| `.module` | the **target class** of the box ([module-scope.ts:130](../src/framework/module-scope.ts#L130)) |
| `.imports/.providers/.exports` | merged into the box **metadata** |

After that, a dynamic box looks exactly like a static one: it holds the
class, and `init` calls `new` on it.

---

## 3. Same content is not the same object

```ts
const a = { name: "cake" };
const b = { name: "cake" };
const c = a;

a === b; // false: same content, TWO objects
a === c; // true:  another name for the SAME object
```

Like identical twins: same face, two people. The caches use **the person,
not the face**.

- A **class** is created once, when its file loads. Every `import` gets that
  same object. There is only one `MatchModule`.
- **`register()` is a cake mould.** Every call produces a new cake, even with
  the same recipe:

```ts
const cake1 = ScoreboardModule.register({ appConfig });
const cake2 = ScoreboardModule.register({ appConfig });
cake1 === cake2; // false → two boxes
```

That is why the dynamic cache must use **the whole object** as the key, never
the class inside it. With the class as key, two `register()` calls with
**different** options would collapse into one box, and the second caller would
get the wrong config.

---

## 4. The two notebooks

The container has a front desk with two notebooks, one per recipe format
([module-scope.ts:125-126](../src/framework/module-scope.ts#L125-L126)):

```ts
const staticModules  = new Map<ModuleClass, ModuleScope>();      // class    → box
const dynamicModules = new WeakMap<DynamicModule, ModuleScope>(); // envelope → box
```

Both are declared **outside** `compile`, so every recursive call reads and
writes **the same notebooks**. If they lived inside `compile`, each call
would get a fresh, empty notebook and nothing would ever be shared.

### `Map` vs `WeakMap` (and `Set`)

| | `Map` | `WeakMap` | `Set` |
|---|---|---|---|
| Stores | key → value | key → value | values only |
| Keys | anything | **objects only** | — |
| Holds the key alive? | yes (strong) | no (garbage collector may drop it) | yes |
| Iterable / `.size` | yes | **no** | yes |
| Typical question | "**what** is X's value?" | "what is X's value?" | "**is** X here?" |

- 🎒 `Map` is a cloakroom: your bag stays there forever, even if you never come back.
- 🗒️ `WeakMap` is a sticky note on the bag: when the bag is thrown away, the note goes with it.
- 🎟️ `Set` is a hand stamp at a party: it only tells you **whether** someone got in.

In this file, the choice between `Map` and `WeakMap` barely matters in
practice: both are local to `create()` and disappear when it returns. The
`WeakMap` mostly signals intent ("identified by object reference"). The
`resolving` field is a `Set` ([module-scope.ts:34](../src/framework/module-scope.ts#L34))
because it only needs to answer "am I in the middle of building this token?".

`Map.set()` appends **at the end** (insertion order). If the key already
exists, it replaces the value and keeps its position. That is why the module
class is always the first provider: it is inserted first
([module-scope.ts:42](../src/framework/module-scope.ts#L42)).

---

## 5. `compile`: building and linking the boxes

There are **two links** that make Match and Leaderboard share one box:

| Link | Guaranteed by | Result |
|---|---|---|
| 1 | The JS module system (a file runs once) | both modules import **the same envelope** |
| 2 | The `dynamicModules` cache in `compile` | the same envelope → **the same box** |

Break either one and you get two boxes.

### `.map(compile)` is not the `Map` cache

```ts
scope.setImports((metadata.imports ?? []).map(compile));
```

`array.map(fn)` transforms each item. It turns a list of **recipes** into a
list of **boxes**:

```ts
const recipes = metadata.imports ?? [];   // [sharedScoreboard]
const boxes   = recipes.map(compile);     // [box #3]
scope.setImports(boxes);
```

`compile` calls itself for each import (recursion), like a matryoshka: to
close the outer doll you need the inner ones ready first.

### The timeline, with both notebooks

The recursion goes **all the way down** one branch before starting the next,
so Match has already written to the notebook when Leaderboard asks.

```
time  call                             📕 staticModules        📗 dynamicModules
                                       (key = CLASS)           (key = ENVELOPE)
────  ───────────────────────────────  ──────────────────────  ───────────────────────
 1    compile(AppModule)     → #1      { AppModule→#1 }        { }
 2     compile(Match)        → #2      { …, Match→#2 }         { }
 3      compile(📨shared)     → #3      (untouched)             { 📨shared→#3 }
 4       compile(📨storage)   → #4      (untouched)             { …, 📨storage→#4 }
 5       compile(📨write)     → #5      (untouched)             { …, 📨write→#5 }
 6       compile(📨app)       → #6      (untouched)             { …, 📨app→#6 }
         #3.setImports([#4,#5,#6]); return #3
       #2.setImports([#3]); return #2
        ─── Match branch DONE ───
 7     compile(Leaderboard)  → #7      { …, Leaderboard→#7 }   (untouched)
 8      compile(📨shared)     → ♻️ #3   (not consulted)         get(📨shared) → #3 ✅
       #7.setImports([#3]); return #7
    #1.setImports([#2, #7]); return #1
```

Final notebooks: 3 static boxes + 4 dynamic boxes = **7 boxes**. The only
cache hit in the whole app is at time 8, and it is what makes both consumers
share the same store.

### Why the box is registered *before* compiling imports

[module-scope.ts:146-148](../src/framework/module-scope.ts#L146-L148)
writes to the notebook first and only then compiles the imports. If the order
were reversed, a second reference to the same definition could arrive before
the first one was written down, and a second box would be built.

It is also why imports are attached later with `setImports` instead of
through the constructor. The constructor does receive `metadata.imports`,
but those are **recipes**, and the box needs **boxes**. Only `compile`, which
owns the notebooks, can turn one into the other.

---

## 6. Merging class metadata with `register()`

```ts
imports: [...(moduleClass.metadata.imports ?? []), ...(definition.imports ?? [])],
```

`...` is **spread**: it pours an array's items into another array. Each line
is "class list + register() list = final list"
([module-scope.ts:136-142](../src/framework/module-scope.ts#L136-L142)).

A dynamic module often has two parts:

| Part | Lives in | Example |
|---|---|---|
| **Fixed**: same on every call | the class's `static metadata` | the services |
| **Variable**: depends on options | the object returned by `register(options)` | the config you passed |

In this repo the fixed part is empty, so the merge looks pointless, but the
test at [module-scope.test.ts:37-66](../src/framework/module-scope.test.ts#L37-L66)
proves it works. Real Nest does the same with `@Module({...})` plus the
`register()` result.

`?? []` replaces a missing field with an empty array, because spreading
`undefined` inside an array throws.

The class must still declare `static readonly metadata = {}`
([scoreboard.module.ts:10](../src/modules/scoreboard/scoreboard.module.ts#L10)).
Without it, TypeScript complains (the `ModuleClass` type requires
`metadata`), and at runtime `moduleClass.metadata.imports` would throw. It is
the simulator's version of an empty `@Module({})`.

---

## 7. `init`: filling the boxes

```ts
for (const imported of this.imports) imported.init();  // 1. imports first
this.assertExports();                                   // 2. validate exports
for (const token of this.providers.keys()) this.get(token); // 3. my providers
this.initialized = true;
```

The full order, matching the `npm start` log line by line:

```
1. #1 AppModule.init()
   ├─ 2. #2 MatchModule.init()
   │   ├─ 3. #3 ScoreboardModule.init()
   │   │   ├─ #4 ConfigModule: new ConfigModule(), factory app.storage
   │   │   ├─ #5 ConfigModule: new ConfigModule(), factory app.scoreboard.write
   │   │   ├─ #6 ConfigModule: new ConfigModule(), factory app.scoreboard
   │   │   └─ providers of #3 (5):
   │   │        new ScoreboardModule()
   │   │        SCOREBOARD_CONFIG → alias, points to the object in #6
   │   │        new StorageProvider(...)       → "InMemoryStore #1"
   │   │        new ScoreReaderService(...)
   │   │        new ScoreWriterService(...)
   │   └─ providers of #2 (3): new MatchModule(), new AnnouncerService(), new MatchService(...)
   ├─ 7. #7 LeaderboardModule.init()
   │   ├─ #3.init() → initialized is already true → RETURNS IMMEDIATELY
   │   └─ providers of #7 (2): new LeaderboardModule(), new LeaderboardService(...)
   └─ providers of #1 (1): new AppModule()
```

### How does Leaderboard "find" that #3 is initialized?

It does not search for anything. Match and Leaderboard hold **the same
`ModuleScope` object** in their `imports` (thanks to `compile`).
`initialized` is a field of that single object. Match's call set it to
`true`; Leaderboard's call reads the same field.

🏠 Two people with keys to the same apartment: if one turns the light on,
the other finds it on.

### The `for` order is not always the creation order

A `get()` can pull a dependency **before its turn**: getting
`ScoreReaderService` first would call `get(StorageProvider)` to pass it to the
constructor. When the loop reaches `StorageProvider`, line
[84](../src/framework/module-scope.ts#L84) finds it in `instances` and
returns the same object. The order in `providers: [...]` does not change the
result.

---

## 8. Before and after `init`

Real snapshots (captured by intercepting the root `init()`), with
`[Function]` replaced by names:

### Box #1: AppModule

```diff
  ModuleScope {
    moduleClass: AppModule,
    id: 1,
    name: "AppModule",
    imports: [ #2 MatchModule, #7 LeaderboardModule ],
    exports: [],
    providers: Map(1) {
      AppModule => AppModule,
    },
-   instances: Map(0) {},
+   instances: Map(1) {
+     AppModule => AppModule {},
+   },
    resolving: Set(0) {},
-   initialized: false,
+   initialized: true,
    initializing: false,
  }
```

### Box #2: MatchModule

```diff
  ModuleScope {
    moduleClass: MatchModule,
    id: 2,
    name: "MatchModule",
    imports: [ #3 ScoreboardModule ],
    exports: [ MatchService ],
    providers: Map(3) {
      MatchModule      => MatchModule,
      AnnouncerService => AnnouncerService,
      MatchService     => MatchService,
    },
-   instances: Map(0) {},
+   instances: Map(3) {
+     MatchModule      => MatchModule {},
+     AnnouncerService => AnnouncerService { id: 1 },
+     MatchService     => MatchService { id: 1, ... },
+   },
    resolving: Set(0) {},
-   initialized: false,
+   initialized: true,
    initializing: false,
  }
```

`init` only touches `instances` and `initialized`. `imports`, `exports` and
`providers` were ready since `compile`.

Also worth noticing:

- `providers` and `instances` share the same keys: one holds the **recipe**,
  the other the **created object**.
- `ScoreWriterService` is **not** in box #2. `MatchService` received it, but
  it lives in box #3's `instances`.
- TypeScript `private` hides nothing at runtime. For real runtime privacy,
  use JavaScript's `#field`.

Real Nest follows the same two phases: the `DependenciesScanner` builds the
module graph, then the `InstanceLoader` creates the providers.

---

## 9. Small JavaScript details

- **`.module` is just a property name** defined by the `DynamicModule` type
  ([module-scope.ts:18](../src/framework/module-scope.ts#L18)), mirroring
  Nest's `DynamicModule` interface. It is not a TypeScript keyword.
- **`typeof SomeClass`** in TypeScript is the type of the class itself (where
  `static` members live), not of its instances.
- **Annotating the return type** (`register(...): DynamicModule`) makes
  errors show up where the object is created, not far away where it is used.
- **Type narrowing:** after `typeof provider === "function"`, TypeScript
  knows the other branch is an object, so `provider.provide` is allowed
  ([module-scope.ts:53](../src/framework/module-scope.ts#L53)).
- **`declare module "x" {}`** (unrelated to `.module`) is TypeScript syntax to
  type a library without types, type non-code imports (`*.svg`), or augment
  an existing module's types (`import "express"` + `declare module "express"`).
