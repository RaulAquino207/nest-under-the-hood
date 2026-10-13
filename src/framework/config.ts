import { DynamicModule, ModuleMetadata, Token } from "./module-scope";

// In @nestjs/config, registerAs returns the factory itself with a KEY attached.
export type ConfigRegistration<T> = (() => T) & { readonly KEY: Token };

export function registerAs<T>(namespace: string, factory: () => T): ConfigRegistration<T> {
  return Object.assign(factory, { KEY: `CONFIGURATION(${namespace})` });
}

export class ConfigModule {
  static readonly metadata: ModuleMetadata = {};

  static forFeature<T>(registration: ConfigRegistration<T>): DynamicModule {
    // Still just a definition. NestFactory.create() will build it.
    return {
      module: ConfigModule,
      providers: [{ provide: registration.KEY, useFactory: registration, inject: [] }],
      exports: [registration.KEY],
    };
  }
}

// A reduced config loader: reads process.env, applies defaults, converts types
// and fails on an invalid boolean. Real projects often use zod, joi or io-ts.
export type Decoder<T> = (value: string, key: string) => T;

export const stringValue: Decoder<string> = (value) => value;
export const booleanFromString: Decoder<boolean> = (value, key) => {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`Invalid config: ${key} must be "true" or "false"`);
};

export function withFallback<T>(decode: Decoder<T>, fallback: T) {
  return (value: string | undefined, key: string): T =>
    value === undefined ? fallback : decode(value, key);
}

export function makeConfig<T extends Record<string, unknown>>(
  schema: { [K in keyof T]: (value: string | undefined, key: string) => T[K] },
): T {
  const config = {} as T;
  for (const key of Object.keys(schema) as (keyof T & string)[]) {
    config[key] = schema[key](process.env[key], key);
  }
  return config;
}
