// =====================================================================
// Unit test: no module, no container. The service is created with
// plain `new` and fake dependencies. That is the practical win of DI.
// =====================================================================

import assert from "node:assert/strict";
import { InMemoryStore } from "./in-memory.store";
import { ScoreReaderService, ScoreWriterService } from "./scoreboard.services";

const store = new InMemoryStore("test-zone");
const app = { SCOREBOARD_NAMESPACE: "test-season" };

const writer = new ScoreWriterService(store, app, {
  SCOREBOARD_WRITE_ZONE: "test-zone",
  FEATURE_FLAG_SCOREBOARD_AUDIT_ENTRIES: true, // flag enabled only in this test
});
const reader = new ScoreReaderService(store, app);

writer.record("tester", 10);

assert.deepEqual(
  store.entries.map((e) => e.type),
  ["score", "audit"],
  "with the flag on, record() writes a score and an audit entry",
);
assert.equal(reader.total("tester"), 10, "audit entries are not counted in the total");

console.log("PASSED: score + audit entry written, total ignores audit entries");
