// =====================================================================
// The app config that consumers pass to ScoreboardModule.register().
// It lives in its own file because more than one module uses it.
// =====================================================================

import { makeConfig, registerAs, stringValue, withFallback } from "../framework/config";
import { ScoreboardAppConfig } from "../modules/scoreboard/scoreboard.config";

export const scoreboardAppConfig = registerAs<ScoreboardAppConfig>("app.scoreboard", () => {
  console.log("  (reading config app.scoreboard)");
  return makeConfig({ SCOREBOARD_NAMESPACE: withFallback(stringValue, "season-1") });
});
