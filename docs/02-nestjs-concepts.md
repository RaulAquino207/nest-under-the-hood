# Part 2: NestJS concepts, one by one

> Each concept points to where it shows up in this repo and how it looks in
> real Nest. Do [Part 1](./01-code-review.md) first.

## Contents

1. [Basic vocabulary](#1-basic-vocabulary)
2. [`imports`, `providers`, `exports`](#2-imports-providers-exports)
3. [Provider shapes](#3-provider-shapes)
4. [Tokens and `@Inject`](#4-tokens-and-inject)
5. [How many instances exist?](#5-how-many-instances-exist)
6. [Dynamic modules: `forRoot`, `register`, `forFeature`](#6-dynamic-modules)
7. [`Async` variants](#7-async-variants)
8. [`@nestjs/config` in practice](#8-nestjsconfig-in-practice)
9. [Scopes: DEFAULT, REQUEST, TRANSIENT](#9-scopes)
10. [This repo translated to real Nest](#10-this-repo-translated-to-real-nest)
11. [Exercises](#11-exercises)

---

## 1. Basic vocabulary

| Term | What it is | In this repo |
|---|---|---|
| **Container (IoC)** | Creates and stores objects and hands them to whoever asks. You never call `new`. | [`NestFactory.create`](../src/framework/module-scope.ts#L124) |
| **Module** | A box with a boundary: declares what it creates, consumes and exposes. | [`MatchModule`](../src/modules/match/match.module.ts) |
| **Provider** | Anything the container knows how to build: class, value, factory, alias. | [`Provider`](../src/framework/module-scope.ts#L7-L10) |
| **Token** | The "key" used to ask for a provider. A class, string or symbol. | [`Token`](../src/framework/module-scope.ts#L2) |
| **Dependency injection (DI)** | A class declares what it needs (in the constructor) and the container supplies it. | [`static inject`](../src/modules/match/match.service.ts#L11) |
| **Module instance** | In Nest, every module becomes an internal `Module` object holding its providers. | [`ModuleScope`](../src/framework/module-scope.ts#L26) |

**Core idea:** the module is the **visibility boundary**; the provider is the
**thing being created**; the token is the **name** used to ask for it.

---

## 2. `imports`, `providers`, `exports`

```ts
@Module({
  imports:     [...], // modules whose exports I consume
  providers:   [...], // what I create and keep (visible only inside me)
  exports:     [...], // the subset I LET importers use
  controllers: [...], // (real Nest) handle HTTP; not part of this simulator
})
```

Rules to keep in mind:

1. **Providers are private by default.** They only leave the module through `exports`.
   → [`StorageProvider`](../src/modules/scoreboard/scoreboard.module.ts#L22) never leaves.
2. **To use something from another module, import the module** (not the class).
3. **Exports are not transitive.** A imports B, B imports C → A does **not**
   see C unless B re-exports it. → [main.ts:31-45](../src/main.ts#L31-L45)
4. **Re-exporting** (real Nest): `exports: [ScoreboardModule]`, or
   `exports: [SomeService]` for a service that came from an import.
5. **Exports must be known.** You can only export what you provide or import.
   → [module-scope.ts:74-81](../src/framework/module-scope.ts#L74-L81)
6. **Global modules** (real Nest): `@Global()` or `global: true` on a
   DynamicModule makes its exports visible without importing. Use sparingly
   (`ConfigModule.forRoot({ isGlobal: true })` is the classic case).
7. **A provider lives in the module that declares it.** Importers receive the
   **same instance**, not a copy. → [module-scope.ts:113-115](../src/framework/module-scope.ts#L113-L115)

---

## 3. Provider shapes

| Shape | Nest syntax | What the container does | In this repo |
|---|---|---|---|
| Class (shorthand) | `providers: [AnnouncerService]` | `new AnnouncerService(...deps)` | [match.module.ts:9](../src/modules/match/match.module.ts#L9) |
| `useClass` | `{ provide: Logger, useClass: JsonLogger }` | Token X, but instantiates class Y | (not in the simulator) |
| `useValue` | `{ provide: 'API_KEY', useValue: 'abc' }` | Hands over a ready value | (not in the simulator) |
| `useFactory` | `{ provide: T, useFactory: (a, b) => ..., inject: [A, B] }` | Resolves `inject`, calls the function, keeps the result | [config.ts:17](../src/framework/config.ts#L17) |
| `useExisting` | `{ provide: ALIAS, useExisting: REAL }` | Alias: returns **the same object** as `REAL` | [scoreboard.module.ts:21](../src/modules/scoreboard/scoreboard.module.ts#L21) |

The shorthand `providers: [AnnouncerService]` is exactly
`{ provide: AnnouncerService, useClass: AnnouncerService }`. That is why
[module-scope.ts:53](../src/framework/module-scope.ts#L53) uses the class
itself as the token, and `provide` for the object shapes.

`useFactory` is the most flexible: conditional logic, third-party clients,
and it is what `registerAs` generates.

### Why the `useExisting` alias is not useless

It looks pointless (it creates nothing), but it solves a real problem. The
services declare their tokens in `static inject` **when the file is
written**. The app config `KEY`, however, **depends on whoever calls
`register()`**: another consumer could pass a config with another namespace.
The alias gives the services a **fixed name** (`SCOREBOARD_CONFIG`), and
`register()` wires that name to the real token at runtime.

---

## 4. Tokens and `@Inject`

- **Class token:** Nest infers it from the parameter type
  (`emitDecoratorMetadata` + `@Injectable()`). No `@Inject` needed.
- **String/symbol token:** TypeScript cannot know which string to use, so you
  mark it: `@Inject('SCOREBOARD_CONFIG')`.

```ts
@Injectable()
export class ScoreReaderService {
  constructor(
    private readonly store: StorageProvider,                       // token = class
    @Inject(SCOREBOARD_CONFIG) private app: ScoreboardAppConfig,    // token = string
  ) {}
}
```

In the simulator, both become an array:
[scoreboard.services.ts:39](../src/modules/scoreboard/scoreboard.services.ts#L39).

> Tip: prefer `Symbol('SCOREBOARD_CONFIG')` over a string in real code. It
> avoids name collisions between libraries.

---

## 5. How many instances exist?

With the default scope, the rule is:

> **One instance per (provider × module instance that declares it × container).**

| Situation | Instances | Why |
|---|---|---|
| A and B import the same static module | **1** | A static module is identified by its class. |
| A and B import the **same object** `sharedScoreboard` | **1** | Same reference → same module. ([shared-scoreboard.ts:6](../src/modules/scoreboard/shared-scoreboard.ts#L6)) |
| A and B each call `ScoreboardModule.register(...)` | **2** (Nest 11+) | Two different objects → two modules. See note below. |
| `AnnouncerService` listed in the `providers` of A **and** B | **2** | Each module creates its own. A common mistake! |
| Two `NestFactory.create()` calls | **2** | Each one is a new container. ([module-scope.test.ts:30-31](../src/framework/module-scope.test.ts#L30-L31)) |
| `useExisting` | **0 new** | Just an alias. |
| Module class (`AppModule`) | **1 per module** | Nest instantiates the module class too. ([module-scope.ts:42](../src/framework/module-scope.ts#L42)) |

**About dynamic module identity:** up to Nest 10, Nest hashed the
DynamicModule metadata, so two `register()` calls with identical options
could land on the **same** module. Since Nest 11, the default is the **object
reference** (what this simulator does). The old behavior can be turned back
on with `NestFactory.create(AppModule, { moduleIdGeneratorAlgorithm: 'deep-hash' })`.
Check which Nest version you are on before assuming either.

**Classic mistake:** putting another module's service in your `providers`
instead of importing its module. It works, but creates a **second instance**
with separate state (another "database", cache or connection).

---

## 6. Dynamic modules

A **static module** has fixed metadata (`@Module({...})`). A **dynamic
module** is a static method that **returns** metadata at runtime, usually to
accept options:

```ts
static register(options): DynamicModule {
  return { module: ScoreboardModule, imports: [...], providers: [...], exports: [...] };
}
```

What Nest does with it: **merges** the class's `@Module()` metadata with the
returned object ([module-scope.ts:136-142](../src/framework/module-scope.ts#L136-L142)).
This lets you keep what never changes in the decorator and return only what
depends on the options.

The method names are **conventions**, not framework rules. The community
follows them:

| Method | Intent | Called | Examples |
|---|---|---|---|
| `forRoot(opts)` | Configure **once** for the whole app, usually at the root, often global. | 1× | `ConfigModule.forRoot()`, `TypeOrmModule.forRoot()` |
| `register(opts)` | A configuration **specific to the caller**. Each call may differ. | N× | `HttpModule.register({ timeout })`, [`ScoreboardModule.register`](../src/modules/scoreboard/scoreboard.module.ts#L12) |
| `forFeature(x)` | Reuses the `forRoot` setup and adds one **piece** (an entity, a config namespace). | N× | `TypeOrmModule.forFeature([User])`, [`ConfigModule.forFeature`](../src/framework/config.ts#L13) |

To generate these methods without writing them by hand, Nest provides
`ConfigurableModuleBuilder`, which creates `register`/`registerAsync` (or
`forRoot`/`forRootAsync` via `.setClassMethodName('forRoot')`) and a
`MODULE_OPTIONS_TOKEN` to inject the options.

---

## 7. `Async` variants

When options depend on **another provider** (for example, they come from
`ConfigService`), use the `Async` version:

```ts
ScoreboardModule.registerAsync({
  imports: [ConfigModule],                 // modules needed to resolve inject
  inject: [ConfigService],                 // what the factory receives
  useFactory: (cfg: ConfigService) => ({   // returns the options
    namespace: cfg.get('SCOREBOARD_NAMESPACE'),
  }),
  // alternatives: useClass: ScoreboardOptionsFactory | useExisting: ...
});
```

Under the hood, `registerAsync` just creates a `useFactory` provider for the
options token, the same thing the
[simulator's `forFeature`](../src/framework/config.ts#L17) does with configs.
It is "async" because the factory may return a Promise, and Nest awaits it
before creating anything that depends on it.

---

## 8. `@nestjs/config` in practice

| Piece | What it does | Here |
|---|---|---|
| `ConfigModule.forRoot({ isGlobal: true })` | Loads `.env`, validates and registers `ConfigService` globally. | not in the simulator |
| `registerAs('app.storage', () => ({...}))` | Creates a namespaced config. Returns the factory + `.KEY`. | [config.ts:6-8](../src/framework/config.ts#L6-L8) |
| `ConfigModule.forFeature(storageConfig)` | Registers **that** config as a provider in the current module. | [config.ts:13-20](../src/framework/config.ts#L13-L20) |
| `@Inject(storageConfig.KEY) cfg: ConfigType<typeof storageConfig>` | Injects the typed object. | [storage.provider.ts:7-9](../src/modules/scoreboard/storage.provider.ts#L7-L9) |
| `configService.get('app.storage.STORAGE_ZONE')` | String-based read (less typed). | — |

The `registerAs` factory **reads** `process.env`; it never writes to it. It
runs when the container resolves the provider, during bootstrap.

> Side note: `STORAGE_ZONE` is read and validated but never used by any
> provider. It is there only to show a config with several keys.

---

## 9. Scopes

| Scope | When it is created | Use |
|---|---|---|
| `DEFAULT` (singleton) | Once, at bootstrap. | 99% of cases. The only one this simulator implements. |
| `REQUEST` | One instance **per HTTP request**. | Per-request user/tenant data. Cost: everything depending on it becomes request-scoped too. |
| `TRANSIENT` | One instance **per consumer** that injects it. | A logger with per-class context. |

```ts
@Injectable({ scope: Scope.REQUEST })
```

---

## 10. This repo translated to real Nest

```ts
// scoreboard.module.ts
@Module({})
export class ScoreboardModule {
  static register(options: { appConfig: ConfigFactory & ConfigFactoryKeyHost }): DynamicModule {
    return {
      module: ScoreboardModule,
      imports: [
        ConfigModule.forFeature(storageConfig),
        ConfigModule.forFeature(scoreboardWriteConfig),
        ConfigModule.forFeature(options.appConfig),
      ],
      providers: [
        { provide: SCOREBOARD_CONFIG, useExisting: options.appConfig.KEY },
        StorageProvider,
        ScoreReaderService,
        ScoreWriterService,
      ],
      exports: [ScoreReaderService, ScoreWriterService],
    };
  }
}

// match.service.ts
@Injectable()
export class MatchService {
  constructor(
    private readonly scoreWriter: ScoreWriterService,
    private readonly announcer: AnnouncerService,
  ) {}
}

// storage.provider.ts
@Injectable()
export class StorageProvider {
  constructor(
    @Inject(scoreboardWriteConfig.KEY) write: ConfigType<typeof scoreboardWriteConfig>,
    @Inject(storageConfig.KEY) storage: ConfigType<typeof storageConfig>,
  ) {}
}
```

| Simulator | Real Nest |
|---|---|
| `static metadata = {...}` | `@Module({...})` |
| `static inject = [...]` | `@Injectable()` + constructor types + `@Inject(token)` |
| `app.get` only sees the root module | `app.get` searches the whole container (`strict: false`) |
| Synchronous bootstrap | `await NestFactory.create(...)`; providers can be async |
| No `forwardRef`, global modules, scopes, lifecycle hooks | All of those exist (`onModuleInit`, `onApplicationShutdown`, ...) |

---

## 11. Exercises

For each one: **predict the output before running**, then run `npm start`
and compare. Undo the change afterwards (`git checkout -- .`).

**E1: Break the sharing.** In
[leaderboard.module.ts:7](../src/modules/leaderboard/leaderboard.module.ts#L7),
replace `sharedScoreboard` with
`ScoreboardModule.register({ appConfig: scoreboardAppConfig })`.
<details><summary>Answer</summary>

`InMemoryStore #2`, `ScoreReaderService #2` and friends show up, plus three
extra `new ConfigModule()`. The leaderboard shows **0 points**: it reads
from another "database".
</details>

**E2: Duplicate instance.** Add `AnnouncerService` to the `providers` of
[LeaderboardModule](../src/modules/leaderboard/leaderboard.module.ts#L8).
<details><summary>Answer</summary>

`AnnouncerService #2` appears. Nobody in Leaderboard uses it, but it is
created anyway (singletons are eager). Two modules declaring it = two
instances.
</details>

**E3: Re-export.** In
[match.module.ts:10](../src/modules/match/match.module.ts#L10), add
`ScoreWriterService` to `exports`.
<details><summary>Answer</summary>

In step `3)`, the first ERROR line disappears: AppModule now reaches the
writer through Match. The second stays (the scoreboard never re-exported the
write config). No new instance is created; it is the **same** `#1`.
</details>

**E4: Feature flag.** Run
`FEATURE_FLAG_SCOREBOARD_AUDIT_ENTRIES=true npm start`.
<details><summary>Answer</summary>

The total is still 33: the writer stores extra `audit` entries, but
`total()` only sums `score`
([scoreboard.services.ts:54](../src/modules/scoreboard/scoreboard.services.ts#L54)).
</details>

**E5: Non-exported provider.** Make `MatchService` inject `StorageProvider`
(add it to [`static inject`](../src/modules/match/match.service.ts#L11) and
to the constructor).
<details><summary>Answer</summary>

Bootstrap fails with `[MatchModule] cannot resolve "StorageProvider"`.
In real Nest: `Nest can't resolve dependencies of the MatchService (...)`.
</details>

**E6: Export something you do not have.** In
[leaderboard.module.ts](../src/modules/leaderboard/leaderboard.module.ts),
add `ScoreWriterService` to `exports` **and** remove `sharedScoreboard`
from `imports`.
<details><summary>Answer</summary>

`[LeaderboardModule] cannot export "ScoreWriterService": it is neither
provided nor imported`. Keep the import and the same export works: it
becomes a re-export.
</details>

**E7: Circular dependency.** Make `AnnouncerService` have
`static inject = [MatchService]` (importing `MatchService` in that file).
<details><summary>Answer</summary>

It fails **before** the container runs:
`ReferenceError: Cannot access 'AnnouncerService' before initialization`.
The two files import each other. `match.module.ts` loads
`announcer.service.ts` first, which loads `match.service.ts`, which needs
`AnnouncerService`, but that class is still halfway through loading. (Which
class shows up in the error depends on import order.)

That is exactly why Nest has `forwardRef(() => MatchService)`: the arrow
function delays reading the class until injection time. Without the import
cycle, the simulator would catch the loop at
[module-scope.ts:88-90](../src/framework/module-scope.ts#L88-L90).
In practice, a cycle usually means a third service should be extracted.
</details>

---

Official references: [Modules](https://docs.nestjs.com/modules) ·
[Dynamic modules](https://docs.nestjs.com/fundamentals/dynamic-modules) ·
[Custom providers](https://docs.nestjs.com/fundamentals/custom-providers) ·
[Injection scopes](https://docs.nestjs.com/fundamentals/injection-scopes) ·
[Configuration](https://docs.nestjs.com/techniques/configuration)
