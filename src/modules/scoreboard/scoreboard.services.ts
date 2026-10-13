// =====================================================================
// The services. They create nothing and do not know a container exists.
// They only declare what they need in the constructor. That is DI.
// (In Nest they would have @Injectable() and @Inject(TOKEN) on params.)
// =====================================================================

import { InMemoryStore } from "./in-memory.store";
import { StorageProvider } from "./storage.provider";
import {
  SCOREBOARD_CONFIG,
  ScoreboardAppConfig,
  ScoreboardWriteConfig,
  scoreboardWriteConfig,
} from "./scoreboard.config";

export class ScoreWriterService {
  static readonly inject = [StorageProvider, SCOREBOARD_CONFIG, scoreboardWriteConfig.KEY];
  private static nextId = 1;

  readonly id = ScoreWriterService.nextId++;

  constructor(
    private readonly store: InMemoryStore,
    private readonly app: ScoreboardAppConfig,
    private readonly flags: ScoreboardWriteConfig,
  ) {
    console.log(`  (ScoreWriterService #${this.id} created with InMemoryStore #${store.id})`);
  }

  record(playerId: string, points: number) {
    this.store.put({ namespace: this.app.SCOREBOARD_NAMESPACE, playerId, points, type: "score" });
    if (this.flags.FEATURE_FLAG_SCOREBOARD_AUDIT_ENTRIES) {
      this.store.put({ namespace: this.app.SCOREBOARD_NAMESPACE, playerId, points, type: "audit" });
    }
  }
}

export class ScoreReaderService {
  static readonly inject = [StorageProvider, SCOREBOARD_CONFIG];
  private static nextId = 1;

  readonly id = ScoreReaderService.nextId++;

  constructor(
    private readonly store: InMemoryStore,
    private readonly app: ScoreboardAppConfig,
  ) {
    console.log(`  (ScoreReaderService #${this.id} created with InMemoryStore #${store.id})`);
  }

  total(playerId: string): number {
    return this.store
      .query(this.app.SCOREBOARD_NAMESPACE, playerId)
      .filter((e) => e.type === "score")
      .reduce((sum, e) => sum + e.points, 0);
  }
}
