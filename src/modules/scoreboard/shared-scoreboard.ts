// A single register() call whose result is imported by two modules.
// Both point to the same object, so the container builds one module box.
import { scoreboardAppConfig } from "../../config/app.config";
import { ScoreboardModule } from "./scoreboard.module";

export const sharedScoreboard = ScoreboardModule.register({ appConfig: scoreboardAppConfig });
