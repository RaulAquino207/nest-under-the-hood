// =====================================================================
// A fake database: an array in memory. No network connection is opened.
// In a real app this would be a database or cloud storage client.
// =====================================================================

export type Entry = { namespace: string; playerId: string; points: number; type: string };

export class InMemoryStore {
  private static nextId = 1;

  readonly id = InMemoryStore.nextId++;
  readonly entries: Entry[] = [];

  constructor(
    public readonly zone: string,
    public readonly endpoint?: string,
  ) {
    console.log(`  (InMemoryStore #${this.id}: zone ${zone}, target ${endpoint ?? "cloud (simulated)"})`);
  }

  put(entry: Entry) {
    this.entries.push(entry);
  }

  query(namespace: string, playerId: string) {
    return this.entries.filter((e) => e.namespace === namespace && e.playerId === playerId);
  }
}
