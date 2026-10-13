// A small slice of what @nestjs/core does. Nothing here depends on Nest.
export type Token<T = unknown> = string | symbol | ClassToken<T>;
export type ClassToken<T = unknown> = new (...args: any[]) => T;

// Without decorators/reflection, `static inject` plays the role of DI metadata.
export type InjectableClass<T = unknown> = ClassToken<T> & { inject?: Token[] };
export type Provider =
  | InjectableClass
  | { provide: Token; useFactory: (...args: any[]) => unknown; inject: Token[] }
  | { provide: Token; useExisting: Token };

export type ModuleMetadata = {
  imports?: ModuleImport[];
  providers?: Provider[];
  exports?: Token[];
};
export type ModuleClass = ClassToken & { metadata: ModuleMetadata; inject?: Token[] };
export type DynamicModule = ModuleMetadata & { module: ModuleClass };
export type ModuleImport = ModuleClass | DynamicModule;

const tokenName = (token: Token): string =>
  typeof token === "function" ? token.name : String(token);

// register() and forFeature() only return metadata (a "recipe"). The container
// builds one ModuleScope (a "box") for each module definition it finds.
export class ModuleScope {
  private static nextId = 1;
  readonly id = ModuleScope.nextId++;
  readonly name: string;
  private imports: ModuleScope[] = [];
  private readonly exports: Token[];
  private readonly providers = new Map<Token, Provider>();
  private readonly instances = new Map<Token, unknown>();
  private readonly resolving = new Set<Token>();
  private initialized = false;
  private initializing = false;

  constructor(readonly moduleClass: ModuleClass, metadata: ModuleMetadata) {
    this.name = moduleClass.name;
    this.exports = metadata.exports ?? [];
    // Nest also registers and instantiates the module class itself.
    this.addProvider(moduleClass);
    for (const provider of metadata.providers ?? []) this.addProvider(provider);
  }

  // Imports arrive later, already compiled into boxes, because only
  // NestFactory.create() has the caches that turn recipes into boxes.
  setImports(imports: ModuleScope[]): void {
    this.imports = imports;
  }

  private addProvider(provider: Provider): void {
    const token = typeof provider === "function" ? provider : provider.provide;
    this.providers.set(token, provider);
  }

  init(): void {
    if (this.initialized) return;
    if (this.initializing) throw new Error(`Circular module import at "${this.name}"`);

    this.initializing = true;
    try {
      for (const imported of this.imports) imported.init();
      this.assertExports();
      for (const token of this.providers.keys()) this.get(token);
      this.initialized = true;
    } finally {
      this.initializing = false;
    }
  }

  // Like Nest, refuse to export something this module neither provides nor
  // receives from one of its imports.
  private assertExports(): void {
    for (const token of this.exports) {
      const known = this.providers.has(token) || this.imports.some((m) => m.exports.includes(token));
      if (!known) {
        throw new Error(`[${this.name}] cannot export "${tokenName(token)}": it is neither provided nor imported`);
      }
    }
  }

  get<T>(token: Token<T>): T {
    if (this.instances.has(token)) return this.instances.get(token) as T;

    const provider = this.providers.get(token);
    if (provider) {
      if (this.resolving.has(token)) {
        throw new Error(`[${this.name}] circular dependency while resolving "${tokenName(token)}"`);
      }

      this.resolving.add(token);
      try {
        let instance: unknown;
        if (typeof provider === "function") {
          const deps = provider.inject ?? [];
          if (provider === this.moduleClass) {
            console.log(`  (new ${this.name}() in module #${this.id})`);
          }
          instance = new provider(...deps.map((dep) => this.get(dep)));
        } else if ("useExisting" in provider) {
          instance = this.get(provider.useExisting);
        } else {
          instance = provider.useFactory(...provider.inject.map((dep) => this.get(dep)));
        }
        this.instances.set(token, instance);
        return instance as T;
      } finally {
        this.resolving.delete(token);
      }
    }

    for (const imported of this.imports) {
      if (imported.exports.includes(token)) return imported.get(token) as T;
    }
    throw new Error(`[${this.name}] cannot resolve "${tokenName(token)}"`);
  }
}

// Each create() gets its own module registry. Reusing the same DynamicModule
// object shares the box; calling register() again produces another object,
// and therefore another box, even when the options are identical.
export class NestFactory {
  static create(root: ModuleImport): ModuleScope {
    const staticModules = new Map<ModuleClass, ModuleScope>();
    const dynamicModules = new WeakMap<DynamicModule, ModuleScope>();

    const compile = (definition: ModuleImport): ModuleScope => {
      const dynamic = typeof definition !== "function";
      const moduleClass = dynamic ? definition.module : definition;
      const cached = dynamic
        ? dynamicModules.get(definition)
        : staticModules.get(moduleClass);
      if (cached) return cached;

      const metadata: ModuleMetadata = dynamic
        ? {
            imports: [...(moduleClass.metadata.imports ?? []), ...(definition.imports ?? [])],
            providers: [...(moduleClass.metadata.providers ?? []), ...(definition.providers ?? [])],
            exports: [...(moduleClass.metadata.exports ?? []), ...(definition.exports ?? [])],
          }
        : moduleClass.metadata;
      const scope = new ModuleScope(moduleClass, metadata);
      // Register the box BEFORE compiling imports, so a second reference to
      // the same definition (or a cycle) finds it in the cache.
      if (dynamic) dynamicModules.set(definition, scope);
      else staticModules.set(moduleClass, scope);
      scope.setImports((metadata.imports ?? []).map(compile));
      return scope;
    };

    const app = compile(root); // phase 1: build and link empty boxes
    app.init(); // phase 2: fill the boxes (create instances)
    return app;
  }
}
