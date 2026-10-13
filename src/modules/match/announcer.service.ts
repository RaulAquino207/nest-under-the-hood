// A plain provider, registered by its own class in MatchModule.
// The id makes it visible how many instances get created.
export class AnnouncerService {
  private static nextId = 1;

  readonly id = AnnouncerService.nextId++;

  constructor() {
    console.log(`  (AnnouncerService #${this.id} created)`);
  }

  shout() {
    return `what a play! (announcer instance #${this.id})`;
  }
}
