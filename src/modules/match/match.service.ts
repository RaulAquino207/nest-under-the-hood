// =====================================================================
// CONSUMER 1: when a player wins a match, they earn points.
// It only knows ScoreWriterService. It knows nothing about storage,
// configs, zones or emulators.
// =====================================================================

import { ScoreWriterService } from "../scoreboard/scoreboard.services";
import { AnnouncerService } from "./announcer.service";

export class MatchService {
  static readonly inject = [ScoreWriterService, AnnouncerService];
  private static nextId = 1;

  readonly id = MatchService.nextId++;

  constructor(
    private readonly scoreWriter: ScoreWriterService,
    private readonly announcer: AnnouncerService,
  ) {
    console.log(
      `  (MatchService #${this.id} created with writer #${scoreWriter.id} and AnnouncerService #${announcer.id})`,
    );
  }

  win(playerId: string, damageDealt: number) {
    console.log(`  [Announcer] ${this.announcer.shout()}`);
    const points = Math.floor(damageDealt / 10); // 1 point per 10 damage
    console.log(`  [Match] ${playerId} won dealing ${damageDealt} damage and earned ${points} points`);
    this.scoreWriter.record(playerId, points);
  }
}
