// =====================================================================
// CONSUMER 2: the leaderboard shows a player's total points.
// It only knows ScoreReaderService (read side).
// =====================================================================

import { ScoreReaderService } from "../scoreboard/scoreboard.services";

export class LeaderboardService {
  static readonly inject = [ScoreReaderService];
  private static nextId = 1;

  readonly id = LeaderboardService.nextId++;

  constructor(private readonly scoreReader: ScoreReaderService) {
    console.log(`  (LeaderboardService #${this.id} created with reader #${scoreReader.id})`);
  }

  show(playerId: string) {
    const total = this.scoreReader.total(playerId);
    console.log(`  [Leaderboard] ${playerId} has ${total} points`);
    return { playerId, total };
  }
}
