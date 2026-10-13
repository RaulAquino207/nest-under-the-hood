# Part 1: Code review walkthrough

> Open this file in a Markdown preview (VS Code: `Cmd+Shift+V`) so the links
> jump straight to the file and line. Follow the steps **in order**: each one
> builds on the previous.

Before starting, run the app once and keep the output next to you:

```bash
npm start
```

You will come back to that output in almost every step. The `#1`, `#2`
numbers in the logs are instance counters: if `#2` shows up, someone created
a second instance of that class.

---

## Step 1: What the app asks from the container

📄 [src/main.ts](../src/main.ts)

| Line | What to look at |
|---|---|
| [main.ts:16](../src/main.ts#L16) | `NestFactory.create(AppModule)`: **all** the work of building modules and creating instances happens here. |
| [main.ts:21-22](../src/main.ts#L21-L22) | `app.get(...)` only **looks up** instances that already exist. Notice that step 1 of the output logs nothing. |
| [main.ts:27-29](../src/main.ts#L27-L29) | Match writes, Leaderboard reads. The leaderboard sees 33 points, so both use the same "database". |
| [main.ts:39-45](../src/main.ts#L39-L45) | Trying to get something the AppModule cannot see. Read the comment above it about `strict`. |

✅ **Checkpoint:** why does step `1)` in the output print no `(... created)`?
<details><summary>Answer</summary>

Because providers are **singletons created eagerly** during `create()`.
`get()` only reads from the cache. Real Nest behaves the same with the default
scope (`Scope.DEFAULT`).
</details>

---

## Step 2: The module graph

📄 [src/app.module.ts](../src/app.module.ts) · [match.module.ts](../src/modules/match/match.module.ts) · [leaderboard.module.ts](../src/modules/leaderboard/leaderboard.module.ts)

- [app.module.ts:6-8](../src/app.module.ts#L6-L8): `static metadata` stands in for `@Module({...})`.
- [match.module.ts:8-10](../src/modules/match/match.module.ts#L8-L10): the three fields side by side:
  - `imports`: modules whose exports I **consume**;
  - `providers`: what I **create and keep**;
  - `exports`: what I **let** importers use.
- [leaderboard.module.ts:7](../src/modules/leaderboard/leaderboard.module.ts#L7): imports **the same** `sharedScoreboard` as Match.

✅ **Checkpoint:** can `AnnouncerService` be injected into `LeaderboardService`?
<details><summary>Answer</summary>

No. It is in Match's `providers` but **not** in its `exports`, and Leaderboard
does not even import Match. A provider that is not exported is private to its
module.
</details>

---

## Step 3: One shared `register()` call

📄 [src/modules/scoreboard/shared-scoreboard.ts:6](../src/modules/scoreboard/shared-scoreboard.ts#L6)

A single `register()` call produces **one object**. That same object (same
reference in memory) is placed in the `imports` of both Match and Leaderboard.

✅ **Checkpoint:** how many times does `InMemoryStore` show up in the output? Why?
<details><summary>Answer</summary>

Once (`#1`). The container saw the same definition object twice and built a
single module. Step 7 shows how it decides that
([module-scope.ts:131-134](../src/framework/module-scope.ts#L131-L134)).
</details>

---

## Step 4: The dynamic module

📄 [src/modules/scoreboard/scoreboard.module.ts](../src/modules/scoreboard/scoreboard.module.ts)

| Line | Concept |
|---|---|
| [L10](../src/modules/scoreboard/scoreboard.module.ts#L10) | **Static** metadata (empty). The dynamic part gets merged into it. |
| [L12](../src/modules/scoreboard/scoreboard.module.ts#L12) | `register(options)`: a static method that **returns a plain object**, not an instance. |
| [L14](../src/modules/scoreboard/scoreboard.module.ts#L14) | `module:` says "this object describes ScoreboardModule". |
| [L15-19](../src/modules/scoreboard/scoreboard.module.ts#L15-L19) | Imports three `ConfigModule.forFeature(...)` → three config modules. |
| [L21](../src/modules/scoreboard/scoreboard.module.ts#L21) | `useExisting`: an **alias** for a token. It creates no new object. |
| [L22-24](../src/modules/scoreboard/scoreboard.module.ts#L22-L24) | Class providers. |
| [L26](../src/modules/scoreboard/scoreboard.module.ts#L26) | Only the two services go out. `StorageProvider` stays private. |

✅ **Checkpoint:** could `MatchService` inject `StorageProvider` directly?
<details><summary>Answer</summary>

No, it is not in the scoreboard's `exports`. That is encapsulation: Match only
knows the facade (`ScoreWriterService`). Try it and you get
`[MatchModule] cannot resolve "StorageProvider"`.
</details>

---

## Step 5: Config: `registerAs`, factory and `process.env`

📄 [scoreboard.config.ts](../src/modules/scoreboard/scoreboard.config.ts) · [src/config/app.config.ts](../src/config/app.config.ts)

- [scoreboard.config.ts:8-15](../src/modules/scoreboard/scoreboard.config.ts#L8-L15): `registerAs("app.storage", factory)`. The factory has **not run yet**.
- [scoreboard.config.ts:26-27](../src/modules/scoreboard/scoreboard.config.ts#L26-L27): the type comes from the factory's return value (≈ Nest's `ConfigType<typeof x>`).
- [scoreboard.config.ts:33](../src/modules/scoreboard/scoreboard.config.ts#L33): an internal string token.
- [app.config.ts:9-12](../src/config/app.config.ts#L9-L12): the config consumers pass in `register({ appConfig })`.

✅ **Checkpoint:** what happens with `STORAGE_EMULATOR_ENABLED=maybe npm start`?
<details><summary>Answer</summary>

Bootstrap fails with `Invalid config: STORAGE_EMULATOR_ENABLED must be "true"
or "false"`, because the factory runs inside `create()` and the decoder
([framework/config.ts:28-32](../src/framework/config.ts#L28-L32)) rejects the
value. Failing at boot is intentional: it beats failing in the middle of a
request.
</details>

---

## Step 6: How `registerAs` and `forFeature` work inside

📄 [src/framework/config.ts](../src/framework/config.ts)

- [L6-8](../src/framework/config.ts#L6-L8): `registerAs` returns **the function itself** with a `KEY = "CONFIGURATION(namespace)"` property. That is exactly what `@nestjs/config` does.
- [L13-20](../src/framework/config.ts#L13-L20): `forFeature` turns it into a `DynamicModule` with a `useFactory` provider and exports the `KEY`.
- [L39-47](../src/framework/config.ts#L39-L47): `makeConfig` reads `process.env`, applies defaults and converts values.

✅ **Checkpoint:** to inject a config, which token do you use, the function or the string?
<details><summary>Answer</summary>

The `KEY` string (see [storage.provider.ts:7](../src/modules/scoreboard/storage.provider.ts#L7)).
In real Nest you would write `@Inject(storageConfig.KEY)`.
</details>

---

## Step 7: The container (the actual "Nest" here)

📄 [src/framework/module-scope.ts](../src/framework/module-scope.ts)

Read in this order:

1. **Types** [L2-19](../src/framework/module-scope.ts#L2-L19): `Token`, the three `Provider` shapes, `ModuleMetadata`, `DynamicModule`.
2. **Compilation** [L123-156](../src/framework/module-scope.ts#L123-L156)
   - [L131-134](../src/framework/module-scope.ts#L131-L134): cache. A static module is keyed by its **class**, a dynamic one by the **object reference**.
   - [L136-142](../src/framework/module-scope.ts#L136-L142): static and dynamic metadata are **merged**.
   - [L146-148](../src/framework/module-scope.ts#L146-L148): register the box first, then compile the imports recursively.
   - [L152-153](../src/framework/module-scope.ts#L152-L153): phase 1 builds empty boxes, phase 2 fills them.
3. **Module scope** [L26-44](../src/framework/module-scope.ts#L26-L44): each module has its own `Map` of providers and `Map` of instances. [L42](../src/framework/module-scope.ts#L42): the **module class** is a provider too.
4. **Initialization** [L57-70](../src/framework/module-scope.ts#L57-L70): imports first, then validate exports, then create each local provider.
5. **Resolution** [L83-117](../src/framework/module-scope.ts#L83-L117):
   - [L84](../src/framework/module-scope.ts#L84): already created? Return it (singleton).
   - [L95-105](../src/framework/module-scope.ts#L95-L105): class → `new`, `useExisting` → alias, `useFactory` → call the function.
   - [L113-115](../src/framework/module-scope.ts#L113-L115): not mine? Look **only in the `exports` of my direct imports**.

✅ **Checkpoint:** why is `new AppModule()` the **last** log line of the bootstrap?
<details><summary>Answer</summary>

Because `init()` initializes imports before local providers
([L63-65](../src/framework/module-scope.ts#L63-L65)). AppModule is the root,
so it finishes last. (Real Nest does not promise this exact order.)
</details>

For a deeper, step-by-step trace of this file, see
[Part 3: Container walkthrough](./03-container-walkthrough.md).

---

## Step 8: The tests

```bash
npm test
```

- [module-scope.test.ts:18-31](../src/framework/module-scope.test.ts#L18-L31): dynamic module identity. Two calls → two modules; same reference → one module; another `create()` → another container.
- [module-scope.test.ts:37-66](../src/framework/module-scope.test.ts#L37-L66): class metadata and `register()` output are merged.
- [module-scope.test.ts:73-82](../src/framework/module-scope.test.ts#L73-L82): exporting an unknown token fails at bootstrap.
- [scoreboard.test.ts:10-26](../src/modules/scoreboard/scoreboard.test.ts#L10-L26): the services are tested **without a container**, using plain `new`. That is the biggest practical win of DI.

---

## Where this simulator differs from real Nest

- **`app.get()` scope.** Here it only sees what the root module can see. In
  real Nest, `app.get(Token)` searches the whole container by default
  (`{ strict: false }`). The equivalent of this simulator is
  `app.select(AppModule).get(Token, { strict: true })`.
- `static metadata` replaces `@Module({...})`; `static inject` replaces the
  constructor metadata produced by `@Injectable()` and `@Inject()`.
- Bootstrap is synchronous and initializes imports in order. Real Nest is
  async and does not promise that order.
- Dynamic module identity is the object reference (Nest 11 default). Nest 10
  and earlier hashed the metadata instead.
- Missing on purpose: re-exporting whole modules (`exports: [SomeModule]`),
  global modules, `forwardRef`, request/transient scopes, async providers,
  lifecycle hooks, `ConfigModule.forRoot()` and `.env` files.

Next: [Part 2: NestJS concepts](./02-nestjs-concepts.md).
