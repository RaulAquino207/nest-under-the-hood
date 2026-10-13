// =====================================================================
// The scoreboard's own configs. Each registerAs() factory reads
// process.env only when the container resolves its provider.
// =====================================================================

import { booleanFromString, makeConfig, registerAs, stringValue, withFallback } from "../../framework/config";

export const storageConfig = registerAs("app.storage", () => {
  console.log("  (reading config app.storage)");
  return makeConfig({
    STORAGE_ZONE: withFallback(stringValue, "zone-a"),
    STORAGE_EMULATOR_ENABLED: withFallback(booleanFromString, false),
    STORAGE_EMULATOR_URL: withFallback(stringValue, "http://localhost:9000"),
  });
});

export const scoreboardWriteConfig = registerAs("app.scoreboard.write", () => {
  console.log("  (reading config app.scoreboard.write)");
  return makeConfig({
    SCOREBOARD_WRITE_ZONE: withFallback(stringValue, "zone-b"),
    FEATURE_FLAG_SCOREBOARD_AUDIT_ENTRIES: withFallback(booleanFromString, false),
  });
});

// The type comes from the factory itself, like Nest's ConfigType<typeof ...>.
export type StorageConfig = ReturnType<typeof storageConfig>;
export type ScoreboardWriteConfig = ReturnType<typeof scoreboardWriteConfig>;

// Shape of the config that consumers must pass to register().
export type ScoreboardAppConfig = { SCOREBOARD_NAMESPACE: string };

// Internal token of the module.
export const SCOREBOARD_CONFIG = "SCOREBOARD_CONFIG";
