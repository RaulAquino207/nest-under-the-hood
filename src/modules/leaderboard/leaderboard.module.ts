import { ModuleMetadata } from "../../framework/module-scope";
import { sharedScoreboard } from "../scoreboard/shared-scoreboard";
import { LeaderboardService } from "./leaderboard.service";

export class LeaderboardModule {
  static readonly metadata: ModuleMetadata = {
    imports: [sharedScoreboard],
    providers: [LeaderboardService],
    exports: [LeaderboardService],
  };
}
