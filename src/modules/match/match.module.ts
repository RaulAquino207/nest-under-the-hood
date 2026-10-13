import { ModuleMetadata } from "../../framework/module-scope";
import { sharedScoreboard } from "../scoreboard/shared-scoreboard";
import { AnnouncerService } from "./announcer.service";
import { MatchService } from "./match.service";

export class MatchModule {
  static readonly metadata: ModuleMetadata = {
    imports: [sharedScoreboard],
    providers: [AnnouncerService, MatchService],
    exports: [MatchService],
  };
}
