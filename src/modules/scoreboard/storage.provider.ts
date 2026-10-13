// A provider that builds the storage client from two configs.
// It is private to ScoreboardModule: nobody outside can inject it.
import { InMemoryStore } from "./in-memory.store";
import { ScoreboardWriteConfig, StorageConfig, scoreboardWriteConfig, storageConfig } from "./scoreboard.config";

export class StorageProvider extends InMemoryStore {
  static readonly inject = [scoreboardWriteConfig.KEY, storageConfig.KEY];

  constructor(write: ScoreboardWriteConfig, storage: StorageConfig) {
    const endpoint = storage.STORAGE_EMULATOR_ENABLED ? storage.STORAGE_EMULATOR_URL : undefined;
    super(write.SCOREBOARD_WRITE_ZONE, endpoint);
  }
}
