# nest-under-the-hood

NestJS dependency injection rebuilt from scratch in plain TypeScript, with no
Nest dependency, to understand what `imports`, `providers`, `exports` and
dynamic modules (`register`, `forRoot`, `forFeature`) actually do, and **how
many instances** end up existing.

## Why this repo exists

I wanted to understand how Nest works under the hood: the naming
conventions, how dynamic modules are built, and why some services are shared
while others get duplicated. So I wrote a tiny container that mimics the
parts of `@nestjs/core` and `@nestjs/config` I cared about.

The first version was a private study written in Portuguese. This repository
is a rewrite in English, reorganized and with a neutral example domain, so
the study can be public and useful to others.

`src/framework/` is a teaching implementation of a **small** part of Nest,
not Nest itself.

## Run it

The repo pins its toolchain with [proto](https://moonrepo.dev/proto)
(`.prototools`: Node 24.15.0 + its bundled npm).

```bash
proto install    # only if you use proto; otherwise any Node 24 works
npm install
npm start        # bootstrap, two matches and a leaderboard read
npm test         # container rules + a service tested without a container
npm run typecheck
```

## The example domain

```text
AppModule
├─ MatchModule
│  ├─ AnnouncerService
│  ├─ MatchService → ScoreWriterService
│  └─ imports sharedScoreboard ───┐
└─ LeaderboardModule              │
   ├─ LeaderboardService → ScoreReaderService
   └─ imports sharedScoreboard ───┘
                    │
                    ▼
            ScoreboardModule   (dynamic module, built by register())
            ├─ ConfigModule(app.storage)
            ├─ ConfigModule(app.scoreboard.write)
            ├─ ConfigModule(app.scoreboard)
            ├─ StorageProvider → InMemoryStore (private)
            ├─ ScoreReaderService   (exported)
            └─ ScoreWriterService   (exported)
```

`sharedScoreboard` is **one object** returned by a single `register()` call
and imported by both consumers. The container builds one module for it, so
both services share the same in-memory store: the leaderboard reads the 33
points the matches wrote. Calling `register()` separately in each consumer
would build two modules with two separate stores.

## From `registerAs` to an instance

```text
registerAs("app.storage", factory)
└─ returns the factory itself with a .KEY property (nothing runs yet)

ConfigModule.forFeature(storageConfig)
└─ returns { module: ConfigModule, providers: [...], exports: [...] }

ScoreboardModule.register({ appConfig })
└─ returns { module: ScoreboardModule, imports, providers, exports }
   (a plain object: nobody called new ScoreboardModule() yet)

NestFactory.create(AppModule)
├─ phase 1, compile: walks imports and builds one ModuleScope ("box") per definition
└─ phase 2, init: creates the singletons
   ├─ new ConfigModule() ×3 and runs the config factories
   ├─ new StorageProvider(...) using the configs
   └─ the services, the consumers and finally new AppModule()
```

## Project layout

```text
src/
├─ main.ts                    # bootstrap
├─ app.module.ts
├─ framework/                 # the mini container (module-scope.ts, config.ts) + tests
├─ config/                    # app config shared by more than one module
└─ modules/
   ├─ match/                  # consumer 1: writes scores
   ├─ leaderboard/            # consumer 2: reads scores
   └─ scoreboard/             # the dynamic module + unit test
docs/
├─ 01-code-review.md          # guided review with clickable file/line links
├─ 02-nestjs-concepts.md      # concepts, instance counting and exercises
└─ 03-container-walkthrough.md # step-by-step trace of the container
```

Start with [docs/01-code-review.md](docs/01-code-review.md).

## Where the simulator simplifies Nest

- `static metadata` replaces `@Module({...})`; `static inject` replaces the
  constructor metadata produced by `@Injectable()` and `@Inject()`.
- `app.get()` only sees what the root module can see. Real Nest's `app.get()`
  searches the whole container by default (`strict: false`).
- Bootstrap is synchronous and initializes imports in order.
- Dynamic module identity is the object reference (the Nest 11 default).
- No `useValue`/`useClass`, module re-exports, global modules, `forwardRef`,
  request/transient scopes, async providers, lifecycle hooks,
  `ConfigModule.forRoot()` or `.env` loading.
- The "database" is an array; zones and endpoints only illustrate client
  configuration. No network connection is opened.

References: [modules](https://docs.nestjs.com/modules),
[dynamic modules](https://docs.nestjs.com/fundamentals/dynamic-modules),
[custom providers](https://docs.nestjs.com/fundamentals/custom-providers) and
[configuration](https://docs.nestjs.com/techniques/configuration).
