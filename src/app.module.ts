import { ModuleMetadata } from "./framework/module-scope";
import { LeaderboardModule } from "./modules/leaderboard/leaderboard.module";
import { MatchModule } from "./modules/match/match.module";

export class AppModule {
  static readonly metadata: ModuleMetadata = {
    imports: [MatchModule, LeaderboardModule],
  };
}
