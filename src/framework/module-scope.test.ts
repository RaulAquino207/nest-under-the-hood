import assert from "node:assert/strict";
import { ConfigModule, registerAs } from "./config";
import { DynamicModule, ModuleMetadata, NestFactory } from "./module-scope";

// --- Dynamic module identity -------------------------------------------------

let rootInstances = 0;
class RootModule {
  static readonly metadata: ModuleMetadata = {};
  constructor() {
    rootInstances++;
  }
}

let calls = 0;
const demoConfig = registerAs("demo", () => ({ sequence: ++calls }));

const first = ConfigModule.forFeature(demoConfig);
const second = ConfigModule.forFeature(demoConfig);
assert.notStrictEqual(first, second, "forFeature returns a new definition on every call");

NestFactory.create({ module: RootModule, imports: [first, second] });
assert.equal(calls, 2, "two definitions build two config providers");
assert.equal(rootInstances, 1, "the container instantiates the module class");

NestFactory.create({ module: RootModule, imports: [first, first] });
assert.equal(calls, 3, "reusing the same definition shares the module inside a container");
assert.equal(rootInstances, 2, "a second bootstrap creates another root module instance");

NestFactory.create({ module: RootModule, imports: [first] });
assert.equal(calls, 4, "a new NestFactory.create builds a separate container");

console.log("PASSED: separate dynamic modules, shared reference and independent containers");

// --- Class metadata + register() output are merged ---------------------------

const regionConfig = registerAs("fixed.region", () => ({ region: "zone-c" }));

class GreetingService {
  static readonly inject = ["GREETING", regionConfig.KEY];
  constructor(
    readonly greeting: string,
    readonly config: { region: string },
  ) {}
}

class FixedPartModule {
  static readonly metadata: ModuleMetadata = {
    imports: [ConfigModule.forFeature(regionConfig)],
    providers: [GreetingService],
    exports: [GreetingService],
  };

  static register(greeting: string): DynamicModule {
    return {
      module: FixedPartModule,
      providers: [{ provide: "GREETING", useFactory: () => greeting, inject: [] }],
      exports: ["GREETING"],
    };
  }
}

const merged = NestFactory.create({ module: RootModule, imports: [FixedPartModule.register("hello")] });
const greetingService = merged.get(GreetingService);
assert.equal(greetingService.greeting, "hello", "register() providers are added to the class providers");
assert.equal(greetingService.config.region, "zone-c", "class imports are added to register() imports");
assert.equal(merged.get("GREETING"), "hello", "register() exports are added to the class exports");

console.log("PASSED: class metadata is merged with the register() output");

// --- Exports must be provided or imported ------------------------------------

class GhostService {}
class BrokenExportModule {
  static readonly metadata: ModuleMetadata = { exports: [GhostService] };
}

assert.throws(
  () => NestFactory.create(BrokenExportModule),
  /cannot export "GhostService"/,
  "exporting an unknown token fails at bootstrap",
);

console.log("PASSED: exporting an unknown token fails at bootstrap");
