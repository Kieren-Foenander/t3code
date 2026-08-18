import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

/**
 * Early project-board databases could record migration 41 before the command
 * receipt table was added to that migration. Repair those databases with a new
 * append-only migration so board commands can be dispatched idempotently.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS board_command_receipts (
      command_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      last_sequence INTEGER NOT NULL,
      created_at TEXT NOT NULL
    )
  `;
});
