// =====================================================================
// The bootstrap. Equivalent to Nest's main.ts (NestFactory.create).
// Run with: npm start
// In real Nest, a Controller (handling HTTP) would call these services.
// Here, main plays that role.
// =====================================================================

import { AppModule } from "./app.module";
import { NestFactory } from "./framework/module-scope";
import { LeaderboardService } from "./modules/leaderboard/leaderboard.service";
import { MatchService } from "./modules/match/match.service";
import { scoreboardWriteConfig } from "./modules/scoreboard/scoreboard.config";
import { ScoreWriterService } from "./modules/scoreboard/scoreboard.services";

console.log("\n0) Bootstrap: building modules and creating singleton providers:");
const app = NestFactory.create(AppModule);
// Look at the log above: InMemoryStore is created only ONCE, even with two
// consumers. Both landed in the SAME ScoreboardModule.

console.log("\n1) Asking the container for the business services:");
const match = app.get(MatchService);
const leaderboard = app.get(LeaderboardService);
// Nothing is logged here: singletons were created eagerly in step 0.
// get() only reads from the cache.

console.log("\n2) Business flow:");
match.win("raul", 250);
match.win("raul", 80);
leaderboard.show("raul");
// The leaderboard sees the points the match wrote = same "database".

console.log("\n3) Exports are NOT transitive:");
// MatchModule imports the scoreboard but does not re-export it, so the
// AppModule scope cannot see the scoreboard services.
// Heads-up: in real Nest, app.get() searches the whole container by default
// ({ strict: false }) and WOULD find them. This simulator's app.get behaves
// like Nest's app.select(AppModule).get(token, { strict: true }). The
// non-transitive rule is what matters for constructor injection.
for (const token of [ScoreWriterService, scoreboardWriteConfig.KEY]) {
  try {
    app.get(token);
  } catch (e) {
    console.log("  ERROR:", (e as Error).message);
  }
}
